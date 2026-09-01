"""Create (or refresh) the CS Student and Business Student demo accounts.

These are the two hardcoded "Try a demo account" options in
frontend/src/pages/Login.jsx. They are real, ordinary accounts (not
is_seed_user=True synthetic students -- the login route rejects seed-user
credentials on purpose), pre-populated with a realistic learning profile,
goal, and interaction history so clicking either demo button lands on a
Dashboard/Catalogue/Activity that already has personalised content instead
of a blank new-account state.

Safe to re-run: each persona's existing account (matched by email) and all
of its related rows are deleted and recreated from scratch via cascade
delete on the User relationships.

Usage (from backend/):
    .venv/Scripts/python.exe scripts/seed_demo_accounts.py
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from app import create_app
from app.extensions import db
from app.models import (
    Bookmark,
    CourseCompletion,
    Goal,
    Interaction,
    Preference,
    RecommendationFeedback,
    Resource,
    ResourceRating,
    User,
)
from app.services import invalidate_cache, warm_cache

random.seed(20260828)  # deterministic demo data across re-runs

PERSONAS = [
    {
        "email": "cs-demo@pathwise.dev",
        "password": "demo1234",
        "name": "CS Student",
        "field_of_study": "Computer Science",
        "skills": "Python, SQL, Machine Learning, Data Structures, Web Development",
        "learning_goals": "Break into a software engineering or data role",
        "goal_title": "Get job-ready in machine learning",
        "goal_tags": "Machine Learning, Python Programming, Deep Learning",
        # Resources are chosen from these skill/category keywords, in order of
        # preference, until enough distinct resources are found.
        "resource_keywords": [
            "Python Programming",
            "Machine Learning",
            "SQL",
            "Data Structures",
            "Web Development",
            "JavaScript",
            "Algorithms",
        ],
        "preferred_category": "Computer Science",
    },
    {
        "email": "business-demo@pathwise.dev",
        "password": "demo1234",
        "name": "Business Student",
        "field_of_study": "Business Management",
        "skills": "Marketing, Financial Analysis, Excel, Leadership, Communication",
        "learning_goals": "Get better at data-driven marketing and financial decision making",
        "goal_title": "Sharpen my business analytics skills",
        "goal_tags": "Marketing, Financial Analysis, Data Analysis",
        "resource_keywords": [
            "Marketing",
            "Financial Analysis",
            "Leadership",
            "Excel",
            "Business Strategy",
            "Communication",
            "Project Management",
        ],
        "preferred_category": "Business",
    },
]

TOUCHED_RESOURCE_COUNT = 12
COMPLETED_COUNT = 3
BOOKMARK_COUNT = 4


def _pick_resources(keywords: list[str], preferred_category: str, limit: int) -> list[Resource]:
    """Deterministically pick up to `limit` distinct resources matching any keyword."""
    chosen: dict[int, Resource] = {}

    for keyword in keywords:
        if len(chosen) >= limit:
            break
        like = f"%{keyword}%"
        query = (
            Resource.query.filter(
                db.or_(Resource.skills.ilike(like), Resource.field_tags.ilike(like))
            )
            .order_by(Resource.category != preferred_category, Resource.rating.desc().nullslast())
            .limit(limit * 2)
        )
        for resource in query.all():
            if resource.id not in chosen:
                chosen[resource.id] = resource
            if len(chosen) >= limit:
                break

    return list(chosen.values())[:limit]


def _delete_existing(email: str) -> None:
    existing = User.query.filter_by(email=email).first()
    if existing is not None:
        db.session.delete(existing)
        db.session.commit()


def _seed_persona(persona: dict) -> None:
    _delete_existing(persona["email"])

    user = User(
        name=persona["name"],
        first_name=persona["name"].split(" ")[0],
        last_name=" ".join(persona["name"].split(" ")[1:]) or "Demo",
        email=persona["email"],
        onboarding_complete=True,
        is_seed_user=False,
    )
    user.set_password(persona["password"])
    db.session.add(user)
    db.session.flush()  # assigns user.id

    db.session.add(
        Preference(
            user_id=user.id,
            field_of_study=persona["field_of_study"],
            skills=persona["skills"],
            learning_goals=persona["learning_goals"],
        )
    )

    resources = _pick_resources(
        persona["resource_keywords"], persona["preferred_category"], TOUCHED_RESOURCE_COUNT
    )
    if len(resources) < TOUCHED_RESOURCE_COUNT:
        print(
            f"  warning: only found {len(resources)} matching resources for "
            f"{persona['name']} (wanted {TOUCHED_RESOURCE_COUNT})"
        )

    now = datetime.now(timezone.utc)
    for position, resource in enumerate(resources):
        # Spread events over the last few weeks so they don't all share a
        # timestamp (the evaluation harness flags identical timestamps).
        occurred_at = now - timedelta(days=(len(resources) - position) * 2, hours=random.randint(0, 8))

        db.session.add(
            Interaction(
                user_id=user.id,
                resource_id=resource.id,
                interaction_type="view",
                created_at=occurred_at,
            )
        )
        if position % 2 == 0:
            db.session.add(
                Interaction(
                    user_id=user.id,
                    resource_id=resource.id,
                    interaction_type="outbound_click",
                    created_at=occurred_at + timedelta(minutes=3),
                )
            )

    for resource in resources[:BOOKMARK_COUNT]:
        db.session.add(Bookmark(user_id=user.id, resource_id=resource.id, created_at=now - timedelta(days=5)))

    for resource in resources[:COMPLETED_COUNT]:
        db.session.add(
            CourseCompletion(
                user_id=user.id,
                resource_id=resource.id,
                completed_at=now - timedelta(days=10),
            )
        )
        db.session.add(
            ResourceRating(
                user_id=user.id,
                resource_id=resource.id,
                rating=random.choice([4, 5]),
                created_at=now - timedelta(days=10),
            )
        )

    if len(resources) > COMPLETED_COUNT:
        liked = resources[COMPLETED_COUNT]
        db.session.add(
            RecommendationFeedback(
                user_id=user.id,
                resource_id=liked.id,
                feedback_type="more_like_this",
                recommendation_rank=1,
                recommendation_reason="content_match",
            )
        )

    db.session.add(
        Goal(
            user_id=user.id,
            title=persona["goal_title"],
            target_tags=persona["goal_tags"],
            status="active",
            created_at=now - timedelta(days=7),
        )
    )

    db.session.commit()

    distinct_resources = len(resources)
    print(
        f"  {persona['name']} <{persona['email']}> -> {distinct_resources} distinct resources touched, "
        f"{min(BOOKMARK_COUNT, distinct_resources)} bookmarked, {min(COMPLETED_COUNT, distinct_resources)} completed & rated, "
        f"1 goal, 1 'more like this' signal."
    )


def main() -> None:
    app = create_app()
    with app.app_context():
        print("Seeding demo accounts...")
        for persona in PERSONAS:
            _seed_persona(persona)

        invalidate_cache()
        warm_cache()
        print("Recommendation cache rebuilt.")
        print("Done. Log in from the Login page's 'Try a demo account' menu to see them.")


if __name__ == "__main__":
    main()
