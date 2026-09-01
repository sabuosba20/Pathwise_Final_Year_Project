
from __future__ import annotations

import re
import threading

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy import desc, func, nulls_last, select
from surprise import SVD, Dataset, Reader

from ..extensions import db
from ..models import (
    Bookmark,
    CourseCompletion,
    Goal,
    Interaction,
    Preference,
    RecommendationFeedback,
    Resource,
    ResourceRating,
)

MIN_GLOBAL_INTERACTIONS = 20
CF_WEIGHT_CAP = 0.6
CF_WEIGHT_SLOPE = 0.075

ALGORITHM_VERSION = "hybrid-diversity-v1"
FALLBACK_ALGORITHM_VERSION = "fallback-popular-v1"

INTERACTION_WEIGHTS = {"view": 1, "outbound_click": 3}
BOOKMARK_WEIGHT = 5
COMPLETION_WEIGHT = 5
MORE_LIKE_THIS_WEIGHT = 4
POSITIVE_FEEDBACK_BOOST = 0.2
NEGATIVE_FEEDBACK_PENALTY = 0.08
DIVERSITY_RELEVANCE_WEIGHT = 0.74
DIVERSITY_CANDIDATE_MULTIPLIER = 8
DIVERSITY_MAX_CANDIDATES = 120
RATING_SCALE = (1, 5)

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_REASON_STOP_WORDS = ENGLISH_STOP_WORDS | {
    "course",
    "courses",
    "learn",
    "learning",
    "skill",
    "skills",
}

_cache_lock = threading.Lock()
_cache = {"content": None, "collaborative": None, "generation": 0}


def _tokenize(text):
    return {
        token
        for token in _TOKEN_RE.findall((text or "").lower())
        if token not in _REASON_STOP_WORDS
    }


class ContentModel:
    def __init__(self, vectorizer, matrix, resource_ids):
        self.vectorizer = vectorizer
        self.matrix = matrix
        self.resource_ids = resource_ids

    @classmethod
    def build(cls):
        resources = db.session.execute(select(Resource)).scalars().all()
        if not resources:
            return None
        corpus = [resource.search_text or "" for resource in resources]
        vectorizer = TfidfVectorizer(stop_words="english")
        matrix = vectorizer.fit_transform(corpus)
        resource_ids = [resource.id for resource in resources]
        return cls(vectorizer, matrix, resource_ids)

    def score_profile(self, profile_text):
        if not profile_text.strip():
            return np.zeros(len(self.resource_ids))
        profile_vector = self.vectorizer.transform([profile_text])
        return cosine_similarity(profile_vector, self.matrix)[0]


class CollaborativeModel:
    def __init__(self, algo):
        self.algo = algo

    @classmethod
    def build(cls):
        ratings = _implicit_ratings()
        if len(ratings) < MIN_GLOBAL_INTERACTIONS:
            return None
        frame = pd.DataFrame(ratings, columns=["user_id", "resource_id", "rating"])
        reader = Reader(rating_scale=RATING_SCALE)
        dataset = Dataset.load_from_df(frame[["user_id", "resource_id", "rating"]], reader)
        trainset = dataset.build_full_trainset()
        algo = SVD()
        algo.fit(trainset)
        return cls(algo)

    def score(self, user_id, resource_ids):
        return np.array(
            [self.algo.predict(user_id, resource_id).est / RATING_SCALE[1] for resource_id in resource_ids]
        )


def _implicit_ratings():
    """Return (user_id, resource_id, rating) triples, max signal per pair."""
    ratings: dict[tuple[int, int], int] = {}

    for user_id, resource_id in db.session.execute(select(Bookmark.user_id, Bookmark.resource_id)):
        key = (user_id, resource_id)
        ratings[key] = max(ratings.get(key, 0), BOOKMARK_WEIGHT)

    for user_id, resource_id, user_rating in db.session.execute(
        select(
            CourseCompletion.user_id,
            CourseCompletion.resource_id,
            ResourceRating.rating,
        ).outerjoin(
            ResourceRating,
            (ResourceRating.user_id == CourseCompletion.user_id)
            & (ResourceRating.resource_id == CourseCompletion.resource_id),
        )
    ):
        if user_rating is not None and user_rating <= 2:
            continue
        key = (user_id, resource_id)
        ratings[key] = max(ratings.get(key, 0), COMPLETION_WEIGHT)

    interaction_rows = db.session.execute(
        select(Interaction.user_id, Interaction.resource_id, Interaction.interaction_type)
    )
    for user_id, resource_id, interaction_type in interaction_rows:
        weight = INTERACTION_WEIGHTS.get(interaction_type, 0)
        if not weight:
            continue
        key = (user_id, resource_id)
        ratings[key] = max(ratings.get(key, 0), weight)

    positive_feedback_rows = db.session.execute(
        select(RecommendationFeedback.user_id, RecommendationFeedback.resource_id).where(
            RecommendationFeedback.feedback_type == "more_like_this"
        )
    )
    for user_id, resource_id in positive_feedback_rows:
        key = (user_id, resource_id)
        ratings[key] = max(ratings.get(key, 0), MORE_LIKE_THIS_WEIGHT)

    return [(user_id, resource_id, rating) for (user_id, resource_id), rating in ratings.items()]


def _get_model(key, builder):
    with _cache_lock:
        if _cache[key] is not None:
            return _cache[key]
        generation = _cache["generation"]

    # Build outside the lock -- this can take a few hundred ms (SVD training,
    # TF-IDF fitting) and must not block other requests. If a write comes in
    # and invalidates the cache while we're building, `generation` will have
    # moved on by the time we're done, so the stale result we just computed
    # is discarded instead of being installed over the newer, empty cache.
    model = builder()

    with _cache_lock:
        if _cache["generation"] == generation:
            _cache[key] = model
        return _cache[key]


def _get_content_model():
    return _get_model("content", ContentModel.build)


def _get_collaborative_model():
    return _get_model("collaborative", CollaborativeModel.build)


def invalidate_collaborative_cache():
    """Clear only the collaborative-filtering model.

    Bookmarks, completions, ratings, interactions, and recommendation feedback
    all feed `_implicit_ratings()` (which the collaborative model is trained
    on) but never change the resource catalogue, so there's no need to also
    throw away and rebuild the content (TF-IDF) model on every one of these.
    """
    with _cache_lock:
        _cache["generation"] += 1
        _cache["collaborative"] = None


def invalidate_content_cache():
    """Clear only the content (TF-IDF) model, e.g. after the catalogue changes."""
    with _cache_lock:
        _cache["generation"] += 1
        _cache["content"] = None


def invalidate_cache():
    """Clear both models."""
    with _cache_lock:
        _cache["generation"] += 1
        _cache["content"] = None
        _cache["collaborative"] = None


def warm_cache():
    content_model = _get_content_model()
    collaborative_model = _get_collaborative_model()
    return {
        "resourceCount": len(content_model.resource_ids) if content_model else 0,
        "collaborativeTrained": collaborative_model is not None,
    }


def weight_for_confidence(n):
    w_cf = min(CF_WEIGHT_CAP, CF_WEIGHT_SLOPE * n)
    return 1 - w_cf, w_cf


def distinct_interaction_count(user_id):
    # Single source of truth: also used by the Activity page so its personalisation
    # display can never drift from the number the recommender actually used.
    bookmark_ids = set(
        db.session.execute(select(Bookmark.resource_id).where(Bookmark.user_id == user_id)).scalars()
    )
    interaction_ids = set(
        db.session.execute(select(Interaction.resource_id).where(Interaction.user_id == user_id)).scalars()
    )
    feedback_ids = set(
        db.session.execute(
            select(RecommendationFeedback.resource_id).where(
                RecommendationFeedback.user_id == user_id
            )
        ).scalars()
    )
    completion_ids = set(
        db.session.execute(
            select(CourseCompletion.resource_id).where(
                CourseCompletion.user_id == user_id
            )
        ).scalars()
    )
    return len(bookmark_ids | interaction_ids | feedback_ids | completion_ids)


def _profile_text(preference):
    if preference is None:
        return ""
    return " ".join(
        part for part in [preference.field_of_study, preference.skills, preference.learning_goals] if part
    )


def _resource_profile_text(resource):
    return " ".join(
        part
        for part in [
            resource.title,
            resource.category,
            resource.skills,
            resource.field_tags,
            resource.search_text,
        ]
        if part
    )


def _best_saved_match(resource, saved_resources):
    resource_tokens = _tokenize(_resource_profile_text(resource))
    best_resource = None
    best_overlap = 0

    for saved_resource in saved_resources:
        overlap = len(resource_tokens & _tokenize(_resource_profile_text(saved_resource)))
        if overlap > best_overlap:
            best_resource = saved_resource
            best_overlap = overlap

    return best_resource, best_overlap


def _matching_values(value, resource_tokens):
    matches = []
    for item in re.split(r"[,;|]", value or ""):
        label = item.strip()
        item_tokens = _tokenize(label)
        if item_tokens and item_tokens.issubset(resource_tokens):
            matches.append(label)
    return matches


def _format_list(values):
    if len(values) < 2:
        return values[0] if values else ""
    if len(values) == 2:
        return " and ".join(values)
    return f"{', '.join(values[:-1])}, and {values[-1]}"


def _diversity_rerank(
    candidate_indices,
    final_scores,
    content_model,
    resources_by_id,
    limit,
):
    if not candidate_indices:
        return [], {}

    candidate_scores = np.array(
        [float(final_scores[index]) for index in candidate_indices]
    )
    score_min = float(candidate_scores.min())
    score_max = float(candidate_scores.max())
    if score_max > score_min:
        normalized_relevance = (
            candidate_scores - score_min
        ) / (score_max - score_min)
    else:
        normalized_relevance = np.ones(len(candidate_indices))

    candidate_matrix = content_model.matrix[candidate_indices]
    similarities = cosine_similarity(candidate_matrix)
    selected_positions = [0]
    diversity_details = {}

    def resource_for_position(position):
        resource_id = content_model.resource_ids[candidate_indices[position]]
        return resources_by_id[resource_id]

    first_resource = resource_for_position(0)
    used_providers = {first_resource.provider}
    used_categories = {first_resource.category}
    used_types = {first_resource.resource_type}
    used_difficulties = {first_resource.difficulty}
    diversity_details[first_resource.id] = {
        "originalRank": 1,
        "diversityRank": 1,
        "promoted": False,
        "noveltyDimensions": [],
        "maxSimilarityToEarlier": 0.0,
    }

    while len(selected_positions) < min(limit, len(candidate_indices)):
        best_position = None
        best_score = float("-inf")
        best_novelty_dimensions = []
        best_max_similarity = 0.0

        for position in range(len(candidate_indices)):
            if position in selected_positions:
                continue

            resource = resource_for_position(position)
            max_similarity = max(
                float(similarities[position, selected])
                for selected in selected_positions
            )
            novelty_dimensions = []
            provider_novelty = resource.provider not in used_providers
            category_novelty = resource.category not in used_categories
            type_novelty = resource.resource_type not in used_types
            difficulty_novelty = resource.difficulty not in used_difficulties
            if provider_novelty:
                novelty_dimensions.append("provider")
            if category_novelty:
                novelty_dimensions.append("subject area")
            if type_novelty:
                novelty_dimensions.append("course format")
            if difficulty_novelty:
                novelty_dimensions.append("difficulty level")

            diversity_component = (
                0.65 * (1 - max_similarity)
                + 0.15 * float(provider_novelty)
                + 0.12 * float(category_novelty)
                + 0.05 * float(type_novelty)
                + 0.03 * float(difficulty_novelty)
            )
            rerank_score = (
                DIVERSITY_RELEVANCE_WEIGHT * normalized_relevance[position]
                + (1 - DIVERSITY_RELEVANCE_WEIGHT) * diversity_component
            )

            if (
                rerank_score > best_score
                or (
                    np.isclose(rerank_score, best_score)
                    and position < best_position
                )
            ):
                best_position = position
                best_score = rerank_score
                best_novelty_dimensions = novelty_dimensions
                best_max_similarity = max_similarity

        selected_positions.append(best_position)
        selected_resource = resource_for_position(best_position)
        used_providers.add(selected_resource.provider)
        used_categories.add(selected_resource.category)
        used_types.add(selected_resource.resource_type)
        used_difficulties.add(selected_resource.difficulty)
        original_rank = best_position + 1
        diversity_rank = len(selected_positions)
        diversity_details[selected_resource.id] = {
            "originalRank": original_rank,
            "diversityRank": diversity_rank,
            "promoted": diversity_rank < original_rank,
            "noveltyDimensions": best_novelty_dimensions,
            "maxSimilarityToEarlier": round(best_max_similarity, 4),
        }

    return (
        [candidate_indices[position] for position in selected_positions],
        diversity_details,
    )


def _diversity_metrics(
    ranked_indices,
    content_model,
    resources_by_id,
    candidate_pool_size,
):
    resources = [
        resources_by_id[content_model.resource_ids[index]]
        for index in ranked_indices
    ]
    if len(ranked_indices) > 1:
        similarity_matrix = cosine_similarity(
            content_model.matrix[ranked_indices]
        )
        upper_triangle = similarity_matrix[
            np.triu_indices(len(ranked_indices), k=1)
        ]
        average_similarity = float(upper_triangle.mean())
    else:
        average_similarity = 0.0

    return {
        "strategy": "maximal_marginal_relevance",
        "score": round(max(0.0, 1 - average_similarity), 4),
        "averagePairwiseSimilarity": round(average_similarity, 4),
        "candidatePoolSize": candidate_pool_size,
        "uniqueProviders": len({resource.provider for resource in resources}),
        "uniqueCategories": len({resource.category for resource in resources}),
        "uniqueResourceTypes": len(
            {resource.resource_type for resource in resources}
        ),
        "uniqueDifficulties": len(
            {resource.difficulty for resource in resources}
        ),
    }


def _build_reasons(
    w_cf,
    preference,
    resource,
    saved_resources,
    completed_resources,
    liked_resources,
    content_score,
    collaborative_score,
    diversity_info,
    active_goals=None,
):
    resource_tokens = _tokenize(_resource_profile_text(resource))
    reasons = []

    saved_match, saved_overlap = _best_saved_match(resource, saved_resources)
    completed_match, completed_overlap = _best_saved_match(
        resource,
        completed_resources,
    )
    exact_liked_resource = next(
        (
            liked_resource
            for liked_resource in liked_resources
            if liked_resource.id == resource.id
        ),
        None,
    )
    liked_match, liked_overlap = _best_saved_match(
        resource,
        [
            liked_resource
            for liked_resource in liked_resources
            if liked_resource.id != resource.id
        ],
    )

    if exact_liked_resource is not None:
        reasons.append(
            {
                "type": "direct_feedback",
                "label": "Direct feedback",
                "text": "You asked Pathwise to show more courses like this one.",
            }
        )
    elif liked_match is not None and liked_overlap > 0:
        reasons.append(
            {
                "type": "direct_feedback",
                "label": "Direct feedback",
                "text": f"You asked for more courses like {liked_match.title}.",
            }
        )

    if saved_match is not None and saved_overlap > 0:
        reasons.append(
            {
                "type": "saved_course",
                "label": "Saved-course similarity",
                "text": f"Similar to {saved_match.title}, which you saved.",
            }
        )

    if completed_match is not None and completed_overlap > 0:
        reasons.append(
            {
                "type": "completed_course",
                "label": "Completed-course similarity",
                "text": f"Builds on {completed_match.title}, which you completed.",
            }
        )

    if preference is not None:
        matching_skills = _matching_values(preference.skills, resource_tokens)
        if matching_skills:
            reasons.append(
                {
                    "type": "skills",
                    "label": "Skills match",
                    "text": f"Connects with your skills in {', '.join(matching_skills[:3])}.",
                }
            )

        field_tokens = _tokenize(preference.field_of_study)
        field_overlap = field_tokens & resource_tokens
        if field_tokens and len(field_overlap) / len(field_tokens) >= 0.5:
            reasons.append(
                {
                    "type": "field_of_study",
                    "label": "Degree relevance",
                    "text": f"Relevant to your {preference.field_of_study} studies.",
                }
            )

        goal_overlap = sorted(
            _tokenize(preference.learning_goals) & resource_tokens
        )
        if goal_overlap:
            reasons.append(
                {
                    "type": "learning_goal",
                    "label": "Learning goal",
                    "text": (
                        "Supports your goal around "
                        f"{', '.join(goal_overlap[:3])}."
                    ),
                }
            )

        subject_tokens = _tokenize(
            " ".join([resource.category, resource.field_tags])
        )
        interest_overlap = sorted(
            _tokenize(
                " ".join(
                    [
                        preference.field_of_study,
                        preference.learning_goals,
                    ]
                )
            )
            & subject_tokens
        )
        if interest_overlap:
            reasons.append(
                {
                    "type": "profile_interest",
                    "label": "Interest overlap",
                    "text": (
                        "Its subject area overlaps with your interests in "
                        f"{', '.join(interest_overlap[:3])}."
                    ),
                }
            )

    if active_goals:
        goal_tag_tokens = _tokenize(
            " ".join(
                tag
                for goal in active_goals
                for tag in Goal.split_tags(goal.target_tags)
            )
        )
        active_goal_overlap = sorted(goal_tag_tokens & resource_tokens)
        if active_goal_overlap:
            reasons.append(
                {
                    "type": "active_goal",
                    "label": "Goal match",
                    "text": (
                        "Supports your active goal around "
                        f"{', '.join(active_goal_overlap[:3])}."
                    ),
                }
            )

    if (
        diversity_info.get("promoted")
        and diversity_info.get("noveltyDimensions")
    ):
        dimensions = _format_list(diversity_info["noveltyDimensions"])
        reasons.append(
            {
                "type": "discovery_balance",
                "label": "Discovery balance",
                "text": (
                    "Promoted to broaden your recommendations with "
                    f"a different {dimensions}."
                ),
            }
        )

    if w_cf > 0 and collaborative_score > 0:
        reasons.append(
            {
                "type": "peer_signal",
                "label": "Learners like you",
                "text": "Students with similar learning activity engaged with this course.",
            }
        )

    if not reasons and content_score > 0:
        reasons.append(
            {
                "type": "content_match",
                "label": "Content relevance",
                "text": "This course shares topics with your available learning signals.",
            }
        )
    if not reasons:
        reasons.append(
            {
                "type": "activity",
                "label": "Learning activity",
                "text": "Selected from the learning activity available on your account.",
            }
        )

    return reasons


def _fallback_recommendations(limit, exclude_resource_ids=None, feedback_counts=None):
    exclude_resource_ids = set(exclude_resource_ids or ())
    query = select(Resource)
    if exclude_resource_ids:
        query = query.where(Resource.id.not_in(exclude_resource_ids))
    resources = db.session.execute(
        query.order_by(nulls_last(desc(Resource.rating)), func.lower(Resource.title)).limit(limit)
    ).scalars().all()
    return {
        "recommendations": [
            {
                "resource": resource.to_dict(),
                "score": None,
                "reason": None,
                "reasons": [],
                "breakdown": None,
                "feedbackType": None,
            }
            for resource in resources
        ],
        "personalized": False,
        "confidence": {
            "contentSources": {
                "learningProfile": False,
                "savedCourseCount": 0,
                "completedCourseCount": (feedback_counts or {}).get("completed", 0),
                "positiveFeedbackCount": (feedback_counts or {}).get("positive", 0),
                "negativeFeedbackCount": (feedback_counts or {}).get("negative", 0),
                "activeGoalCount": 0,
            },
            "interactionCount": 0,
            "weightContent": 1.0,
            "weightCollaborative": 0.0,
        },
    }


def recommend_for_user(user_id, limit=12):
    preference = db.session.execute(
        select(Preference).where(Preference.user_id == user_id)
    ).scalar_one_or_none()
    active_goals = db.session.execute(
        select(Goal).where(Goal.user_id == user_id, Goal.status == "active")
    ).scalars().all()
    saved_resources = db.session.execute(
        select(Resource)
        .join(Bookmark, Bookmark.resource_id == Resource.id)
        .where(Bookmark.user_id == user_id)
        .order_by(Bookmark.created_at.desc())
    ).scalars().all()
    bookmarked_ids = {resource.id for resource in saved_resources}
    completion_rows = db.session.execute(
        select(CourseCompletion).where(CourseCompletion.user_id == user_id)
    ).scalars().all()
    completed_resource_ids = {
        completion.resource_id for completion in completion_rows
    }
    completion_ratings = dict(
        db.session.execute(
            select(ResourceRating.resource_id, ResourceRating.rating).where(
                ResourceRating.user_id == user_id,
                ResourceRating.resource_id.in_(completed_resource_ids),
            )
        ).all()
    ) if completed_resource_ids else {}
    completed_resources = list(
        db.session.execute(
            select(Resource).where(Resource.id.in_(completed_resource_ids))
        ).scalars()
    ) if completed_resource_ids else []
    positive_completed_resources = [
        resource
        for resource in completed_resources
        if completion_ratings.get(resource.id, 3) >= 3
    ]
    feedback_rows = db.session.execute(
        select(RecommendationFeedback).where(
            RecommendationFeedback.user_id == user_id
        )
    ).scalars().all()
    feedback_by_resource_id = {
        feedback.resource_id: feedback for feedback in feedback_rows
    }
    liked_resource_ids = {
        feedback.resource_id
        for feedback in feedback_rows
        if feedback.feedback_type == "more_like_this"
    }
    disliked_resource_ids = {
        feedback.resource_id
        for feedback in feedback_rows
        if feedback.feedback_type == "not_interested"
    }
    feedback_resources = {
        resource.id: resource
        for resource in db.session.execute(
            select(Resource).where(
                Resource.id.in_(liked_resource_ids | disliked_resource_ids)
            )
        ).scalars()
    } if liked_resource_ids or disliked_resource_ids else {}
    liked_resources = [
        feedback_resources[resource_id]
        for resource_id in liked_resource_ids
        if resource_id in feedback_resources
    ]
    disliked_resources = [
        feedback_resources[resource_id]
        for resource_id in disliked_resource_ids
        if resource_id in feedback_resources
    ]
    excluded_resource_ids = (
        bookmarked_ids | disliked_resource_ids | completed_resource_ids
    )

    content_model = _get_content_model()
    profile_text = _profile_text(preference)
    has_learning_profile = bool(_tokenize(profile_text))
    goal_tags = sorted({
        tag
        for goal in active_goals
        for tag in Goal.split_tags(goal.target_tags)
    })
    content_seed_parts = []
    if has_learning_profile:
        content_seed_parts.append(profile_text)
    if goal_tags:
        content_seed_parts.append(" ".join(goal_tags))
    content_seed_parts.extend(_resource_profile_text(resource) for resource in saved_resources)
    content_seed_parts.extend(
        _resource_profile_text(resource)
        for resource in positive_completed_resources
    )
    content_seed_parts.extend(_resource_profile_text(resource) for resource in liked_resources)
    content_seed = " ".join(content_seed_parts)

    if content_model is None or not _tokenize(content_seed):
        return _fallback_recommendations(
            limit,
            exclude_resource_ids=excluded_resource_ids,
            feedback_counts={
                "positive": len(liked_resources),
                "negative": len(disliked_resources),
                "completed": len(completed_resources),
            },
        )

    content_scores = content_model.score_profile(content_seed)
    positive_feedback_scores = (
        content_model.score_profile(
            " ".join(_resource_profile_text(resource) for resource in liked_resources)
        )
        if liked_resources
        else np.zeros(len(content_model.resource_ids))
    )
    negative_feedback_scores = (
        content_model.score_profile(
            " ".join(_resource_profile_text(resource) for resource in disliked_resources)
        )
        if disliked_resources
        else np.zeros(len(content_model.resource_ids))
    )
    for index, resource_id in enumerate(content_model.resource_ids):
        if resource_id in liked_resource_ids:
            positive_feedback_scores[index] = 0.0

    n = distinct_interaction_count(user_id)
    w_cb, w_cf = weight_for_confidence(n)

    collaborative_model = _get_collaborative_model() if n > 0 else None
    if collaborative_model is not None:
        collab_scores = collaborative_model.score(user_id, content_model.resource_ids)
    else:
        collab_scores = np.zeros(len(content_model.resource_ids))
        w_cb, w_cf = 1.0, 0.0

    final_scores = (
        w_cb * content_scores
        + w_cf * collab_scores
        + POSITIVE_FEEDBACK_BOOST * positive_feedback_scores
        - NEGATIVE_FEEDBACK_PENALTY * negative_feedback_scores
    )
    relevance_ranked_indices = sorted(
        (
            index
            for index in range(len(final_scores))
            if content_model.resource_ids[index]
            not in excluded_resource_ids
        ),
        key=lambda index: (
            -float(final_scores[index]),
            content_model.resource_ids[index],
        ),
    )
    candidate_pool_size = min(
        len(relevance_ranked_indices),
        max(limit, min(limit * DIVERSITY_CANDIDATE_MULTIPLIER, DIVERSITY_MAX_CANDIDATES)),
    )
    candidate_indices = relevance_ranked_indices[:candidate_pool_size]
    candidate_resource_ids = [
        content_model.resource_ids[index] for index in candidate_indices
    ]
    resources_by_id = {
        resource.id: resource
        for resource in db.session.execute(
            select(Resource).where(Resource.id.in_(candidate_resource_ids))
        ).scalars()
    }
    candidate_indices = [
        index
        for index in candidate_indices
        if content_model.resource_ids[index] in resources_by_id
    ]
    ranked_indices, diversity_details = _diversity_rerank(
        candidate_indices,
        final_scores,
        content_model,
        resources_by_id,
        limit,
    )
    ranked_resource_ids = [content_model.resource_ids[index] for index in ranked_indices]

    diversity_metrics = _diversity_metrics(
        ranked_indices,
        content_model,
        resources_by_id,
        candidate_pool_size,
    )
    recommendations = []
    for index in ranked_indices:
        resource_id = content_model.resource_ids[index]
        resource = resources_by_id.get(resource_id)
        if resource is None:
            continue
        diversity_info = diversity_details.get(resource_id, {})
        reasons = _build_reasons(
            w_cf,
            preference,
            resource,
            saved_resources,
            positive_completed_resources,
            liked_resources,
            float(content_scores[index]),
            float(collab_scores[index]),
            diversity_info,
            active_goals,
        )
        recommendations.append(
            {
                "resource": resource.to_dict(is_bookmarked=False),
                "score": round(float(final_scores[index]), 4),
                "reason": reasons[0]["text"],
                "reasons": reasons,
                "feedbackType": (
                    feedback_by_resource_id[resource_id].feedback_type
                    if resource_id in feedback_by_resource_id
                    else None
                ),
                "breakdown": {
                    "contentScore": round(float(content_scores[index]), 4),
                    "collabScore": round(float(collab_scores[index]), 4),
                    "positiveFeedbackScore": round(
                        float(positive_feedback_scores[index]),
                        4,
                    ),
                    "negativeFeedbackScore": round(
                        float(negative_feedback_scores[index]),
                        4,
                    ),
                    "relevanceRank": diversity_info.get("originalRank"),
                    "diversityRank": diversity_info.get("diversityRank"),
                    "diversityPromoted": diversity_info.get("promoted", False),
                    "maxSimilarityToEarlier": diversity_info.get(
                        "maxSimilarityToEarlier",
                        0.0,
                    ),
                },
            }
        )

    return {
        "recommendations": recommendations,
        "personalized": True,
        "confidence": {
            "contentSources": {
                "learningProfile": has_learning_profile,
                "savedCourseCount": len(saved_resources),
                "completedCourseCount": len(completed_resources),
                "positiveFeedbackCount": len(liked_resources),
                "negativeFeedbackCount": len(disliked_resources),
                "activeGoalCount": len(active_goals),
            },
            "interactionCount": n,
            "weightContent": round(w_cb, 4),
            "weightCollaborative": round(w_cf, 4),
            "diversity": diversity_metrics,
        },
    }
