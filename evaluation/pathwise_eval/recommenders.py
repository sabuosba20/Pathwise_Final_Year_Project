from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

try:
    from surprise import Dataset, Reader, SVD
except ImportError as error:  # pragma: no cover - exercised by CLI environment check
    Dataset = Reader = SVD = None
    SURPRISE_IMPORT_ERROR = error
else:
    SURPRISE_IMPORT_ERROR = None


ALGORITHM_LABELS = {
    "popular": "Popular courses baseline",
    "content_only": "Content-based only",
    "collaborative_only": "Collaborative filtering only",
    "hybrid": "Hybrid recommendation",
    "hybrid_saved_feedback": "Hybrid with saved courses and feedback",
}

ALGORITHM_KEYS = list(ALGORITHM_LABELS)
CF_WEIGHT_CAP = 0.6
CF_WEIGHT_SLOPE = 0.075
POSITIVE_FEEDBACK_BOOST = 0.2
NEGATIVE_FEEDBACK_PENALTY = 0.08
DIVERSITY_RELEVANCE_WEIGHT = 0.74
DIVERSITY_CANDIDATE_MULTIPLIER = 8
DIVERSITY_MAX_CANDIDATES = 120


@dataclass
class ModelBundle:
    resources: pd.DataFrame
    preferences: pd.DataFrame
    train: pd.DataFrame
    vectorizer: TfidfVectorizer
    resource_matrix: object
    resource_ids: np.ndarray
    resource_index: dict[int, int]
    popularity_scores: np.ndarray
    collaborative_model: object | None
    collaborative_available: bool


def _clean_text(value) -> str:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return ""
    return str(value).strip()


def _resource_profile_text(row: pd.Series) -> str:
    return " ".join(
        _clean_text(row.get(column))
        for column in [
            "title",
            "category",
            "skills",
            "field_tags",
            "search_text",
        ]
        if _clean_text(row.get(column))
    )


def _profile_map(preferences: pd.DataFrame) -> dict[int, str]:
    result: dict[int, str] = {}
    for row in preferences.itertuples(index=False):
        result[int(row.user_id)] = " ".join(
            part
            for part in [
                _clean_text(row.field_of_study),
                _clean_text(row.skills),
                _clean_text(row.learning_goals),
            ]
            if part
        )
    return result


def build_models(
    resources: pd.DataFrame,
    preferences: pd.DataFrame,
    train: pd.DataFrame,
    random_seed: int = 42,
) -> ModelBundle:
    if SURPRISE_IMPORT_ERROR is not None:
        raise RuntimeError(
            "scikit-surprise is required for the collaborative variants. "
            "Run the evaluator with backend/.venv on Python 3.11 or 3.12."
        ) from SURPRISE_IMPORT_ERROR

    resource_rows = resources.sort_values("id").reset_index(drop=True).copy()
    resource_ids = resource_rows["id"].astype(int).to_numpy()
    resource_index = {
        int(resource_id): index
        for index, resource_id in enumerate(resource_ids)
    }
    corpus = [
        _clean_text(value)
        for value in resource_rows["search_text"].tolist()
    ]
    vectorizer = TfidfVectorizer(stop_words="english")
    resource_matrix = vectorizer.fit_transform(corpus)

    popularity_scores = np.zeros(len(resource_ids), dtype=float)
    positive_train = train[train["signal_weight"] > 0]
    for row in positive_train.itertuples(index=False):
        index = resource_index.get(int(row.resource_id))
        if index is not None:
            popularity_scores[index] += float(row.signal_weight)
    maximum_popularity = float(popularity_scores.max(initial=0))
    if maximum_popularity > 0:
        popularity_scores /= maximum_popularity

    collaborative_model = None
    if len(positive_train) >= 20:
        ratings = positive_train[
            ["user_id", "resource_id", "signal_weight"]
        ].copy()
        ratings["signal_weight"] = ratings["signal_weight"].clip(1, 5)
        reader = Reader(rating_scale=(1, 5))
        dataset = Dataset.load_from_df(ratings, reader)
        trainset = dataset.build_full_trainset()
        collaborative_model = SVD(
            random_state=random_seed,
            n_factors=50,
            n_epochs=20,
        )
        collaborative_model.fit(trainset)

    return ModelBundle(
        resources=resource_rows,
        preferences=preferences,
        train=train,
        vectorizer=vectorizer,
        resource_matrix=resource_matrix,
        resource_ids=resource_ids,
        resource_index=resource_index,
        popularity_scores=popularity_scores,
        collaborative_model=collaborative_model,
        collaborative_available=collaborative_model is not None,
    )


def recommend_for_users(
    models: ModelBundle,
    user_ids: list[int],
    limit: int,
) -> tuple[dict[str, dict[int, list[int]]], dict]:
    profiles = _profile_map(models.preferences)
    recommendations = {
        algorithm: {}
        for algorithm in ALGORITHM_KEYS
    }
    diagnostics = {
        "collaborativeAvailable": models.collaborative_available,
        "contentFallbackUsers": [],
        "collaborativeFallbackUsers": [],
    }

    for user_id in user_ids:
        user_train = models.train[models.train["user_id"] == user_id]
        seen_ids = set(user_train["resource_id"].astype(int))
        candidate_mask = np.array(
            [
                int(resource_id) not in seen_ids
                for resource_id in models.resource_ids
            ],
            dtype=bool,
        )
        profile_text = profiles.get(user_id, "")
        profile_scores = _content_scores(models, profile_text)
        if not profile_text.strip():
            profile_scores = models.popularity_scores.copy()
            diagnostics["contentFallbackUsers"].append(user_id)

        collaborative_scores = _collaborative_scores(models, user_id)
        if not models.collaborative_available:
            collaborative_scores = models.popularity_scores.copy()
            diagnostics["collaborativeFallbackUsers"].append(user_id)

        recommendations["popular"][user_id] = _top_ids(
            models,
            models.popularity_scores,
            candidate_mask,
            limit,
        )
        recommendations["content_only"][user_id] = _top_ids(
            models,
            profile_scores,
            candidate_mask,
            limit,
        )
        recommendations["collaborative_only"][user_id] = _top_ids(
            models,
            collaborative_scores,
            candidate_mask,
            limit,
        )

        interaction_count = int(len(user_train))
        collaborative_weight = min(
            CF_WEIGHT_CAP,
            CF_WEIGHT_SLOPE * interaction_count,
        )
        if not models.collaborative_available:
            collaborative_weight = 0.0
        content_weight = 1.0 - collaborative_weight
        hybrid_scores = (
            content_weight * profile_scores
            + collaborative_weight * collaborative_scores
        )
        recommendations["hybrid"][user_id] = _top_ids(
            models,
            hybrid_scores,
            candidate_mask,
            limit,
        )

        full_scores = _full_pathwise_scores(
            models,
            user_train,
            profile_text,
            collaborative_scores,
            content_weight,
            collaborative_weight,
        )
        recommendations["hybrid_saved_feedback"][user_id] = _diverse_top_ids(
            models,
            full_scores,
            candidate_mask,
            limit,
        )

    return recommendations, diagnostics


def _content_scores(models: ModelBundle, text: str) -> np.ndarray:
    if not text.strip():
        return np.zeros(len(models.resource_ids), dtype=float)
    vector = models.vectorizer.transform([text])
    return cosine_similarity(vector, models.resource_matrix)[0]


def _collaborative_scores(models: ModelBundle, user_id: int) -> np.ndarray:
    if models.collaborative_model is None:
        return np.zeros(len(models.resource_ids), dtype=float)
    return np.array(
        [
            models.collaborative_model.predict(
                int(user_id),
                int(resource_id),
            ).est
            / 5.0
            for resource_id in models.resource_ids
        ],
        dtype=float,
    )


def _seed_text(models: ModelBundle, resource_ids: list[int]) -> str:
    parts = []
    for resource_id in resource_ids:
        index = models.resource_index.get(int(resource_id))
        if index is None:
            continue
        parts.append(_resource_profile_text(models.resources.iloc[index]))
    return " ".join(parts)


def _full_pathwise_scores(
    models: ModelBundle,
    user_train: pd.DataFrame,
    profile_text: str,
    collaborative_scores: np.ndarray,
    content_weight: float,
    collaborative_weight: float,
) -> np.ndarray:
    saved_ids = user_train.loc[
        user_train["has_save"] == 1,
        "resource_id",
    ].astype(int).tolist()
    completed_ids = user_train.loc[
        user_train["has_complete"] == 1,
        "resource_id",
    ].astype(int).tolist()
    liked_ids = user_train.loc[
        user_train["has_more_like_this"] == 1,
        "resource_id",
    ].astype(int).tolist()
    disliked_ids = user_train.loc[
        user_train["has_not_interested"] == 1,
        "resource_id",
    ].astype(int).tolist()

    content_seed = " ".join(
        part
        for part in [
            profile_text,
            _seed_text(models, saved_ids),
            _seed_text(models, completed_ids),
            _seed_text(models, liked_ids),
        ]
        if part.strip()
    )
    if content_seed.strip():
        content_scores = _content_scores(models, content_seed)
    else:
        content_scores = models.popularity_scores.copy()

    positive_feedback_scores = _content_scores(
        models,
        _seed_text(models, liked_ids),
    )
    negative_feedback_scores = _content_scores(
        models,
        _seed_text(models, disliked_ids),
    )
    return (
        content_weight * content_scores
        + collaborative_weight * collaborative_scores
        + POSITIVE_FEEDBACK_BOOST * positive_feedback_scores
        - NEGATIVE_FEEDBACK_PENALTY * negative_feedback_scores
    )


def _ranked_indices(
    scores: np.ndarray,
    candidate_mask: np.ndarray,
) -> list[int]:
    return sorted(
        np.flatnonzero(candidate_mask).tolist(),
        key=lambda index: (-float(scores[index]), int(index)),
    )


def _top_ids(
    models: ModelBundle,
    scores: np.ndarray,
    candidate_mask: np.ndarray,
    limit: int,
) -> list[int]:
    return [
        int(models.resource_ids[index])
        for index in _ranked_indices(scores, candidate_mask)[:limit]
    ]


def _diverse_top_ids(
    models: ModelBundle,
    scores: np.ndarray,
    candidate_mask: np.ndarray,
    limit: int,
) -> list[int]:
    ranked = _ranked_indices(scores, candidate_mask)
    candidate_count = min(
        len(ranked),
        max(
            limit,
            min(
                limit * DIVERSITY_CANDIDATE_MULTIPLIER,
                DIVERSITY_MAX_CANDIDATES,
            ),
        ),
    )
    candidates = ranked[:candidate_count]
    if len(candidates) <= 1:
        return [
            int(models.resource_ids[index])
            for index in candidates
        ]

    candidate_scores = np.array(
        [float(scores[index]) for index in candidates]
    )
    score_min = float(candidate_scores.min())
    score_max = float(candidate_scores.max())
    if score_max > score_min:
        normalized = (candidate_scores - score_min) / (score_max - score_min)
    else:
        normalized = np.ones(len(candidates))

    similarities = cosine_similarity(models.resource_matrix[candidates])
    selected = [0]
    first = models.resources.iloc[candidates[0]]
    used_providers = {first["provider"]}
    used_categories = {first["category"]}
    used_types = {first["resource_type"]}
    used_difficulties = {first["difficulty"]}

    while len(selected) < min(limit, len(candidates)):
        best_position = None
        best_score = float("-inf")
        for position, resource_index in enumerate(candidates):
            if position in selected:
                continue
            resource = models.resources.iloc[resource_index]
            max_similarity = max(
                float(similarities[position, earlier])
                for earlier in selected
            )
            provider_novelty = resource["provider"] not in used_providers
            category_novelty = resource["category"] not in used_categories
            type_novelty = resource["resource_type"] not in used_types
            difficulty_novelty = resource["difficulty"] not in used_difficulties
            diversity_component = (
                0.65 * (1 - max_similarity)
                + 0.15 * float(provider_novelty)
                + 0.12 * float(category_novelty)
                + 0.05 * float(type_novelty)
                + 0.03 * float(difficulty_novelty)
            )
            rerank_score = (
                DIVERSITY_RELEVANCE_WEIGHT * normalized[position]
                + (1 - DIVERSITY_RELEVANCE_WEIGHT) * diversity_component
            )
            if (
                rerank_score > best_score
                or (
                    np.isclose(rerank_score, best_score)
                    and (
                        best_position is None
                        or position < best_position
                    )
                )
            ):
                best_position = position
                best_score = rerank_score

        selected.append(best_position)
        selected_resource = models.resources.iloc[candidates[best_position]]
        used_providers.add(selected_resource["provider"])
        used_categories.add(selected_resource["category"])
        used_types.add(selected_resource["resource_type"])
        used_difficulties.add(selected_resource["difficulty"])

    return [
        int(models.resource_ids[candidates[position]])
        for position in selected
    ]
