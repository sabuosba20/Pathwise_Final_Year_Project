"""Flask CLI commands for developing and demonstrating the recommendation engine."""

from __future__ import annotations

import random
import secrets

import click
import numpy as np
from flask import Flask

from ..extensions import db
from ..models import Bookmark, Interaction, Preference, Resource, User
from ..services import ContentModel, invalidate_cache, warm_cache

# Representative student profiles, loosely modelled on a field-of-study mix
# with a CS/IT majority and a diverse tail.
SEED_PROFILES = [
    ("Computer Science", "Python, SQL, algorithms", "Build stronger data analysis skills"),
    ("Computer Science", "JavaScript, React, Node.js", "Become a full-stack web developer"),
    ("Information Technology", "Networking, Linux, security basics", "Prepare for a cybersecurity role"),
    ("Data Science", "Python, statistics, machine learning", "Deepen my machine learning knowledge"),
    ("Business Management", "Leadership, communication, planning", "Lead a project team confidently"),
    ("Finance", "Accounting, financial modelling, Excel", "Understand corporate finance better"),
    ("Psychology", "Research, critical thinking, writing", "Understand human behaviour and cognition"),
    ("Engineering", "CAD, problem solving, mathematics", "Strengthen my engineering design skills"),
    ("Graphic Design", "Design thinking, Figma, typography", "Build a stronger design portfolio"),
    ("Marketing", "Content creation, analytics, communication", "Learn digital marketing strategy"),
    ("Multimedia", "Video editing, animation, storytelling", "Produce more polished multimedia projects"),
    ("Linguistics", "Research, writing, language analysis", "Explore computational linguistics"),
    ("Medicine", "Biology, research, attention to detail", "Support pre-clinical research skills"),
    ("English Education", "Communication, curriculum design, writing", "Improve teaching and lesson design"),
]

# Sampling weights so the seeded population's field mix approximates a
# survey finding that 76.7% of respondents study Computer Science/IT. Four
# of the fourteen templates above are CS-adjacent (both Computer Science
# entries, Information Technology, Data Science); weighting them 8x against
# the other ten (weight 1 each) lands at 32/42 = 76.2% CS-adjacent overall.
CS_ADJACENT_FIELDS = {"Computer Science", "Information Technology", "Data Science"}
CS_ADJACENT_WEIGHT = 8
SEED_PROFILE_WEIGHTS = [
    CS_ADJACENT_WEIGHT if field_of_study in CS_ADJACENT_FIELDS else 1
    for field_of_study, _, _ in SEED_PROFILES
]

SEED_EMAIL_DOMAIN = "pathwise.local"
MIN_TOUCHED_RESOURCES = 5
MAX_TOUCHED_RESOURCES = 15
BOOKMARK_PROBABILITY = 0.3
CLICK_PROBABILITY = 0.5


def _delete_seed_users() -> int:
    seed_users = User.query.filter_by(is_seed_user=True).all()
    count = len(seed_users)
    for user in seed_users:
        db.session.delete(user)
    db.session.commit()
    return count


def _sample_resource_ids(content_model: ContentModel, profile_text: str, k: int) -> list[int]:
    scores = content_model.score_profile(profile_text)
    noise = np.random.uniform(0, 0.3, size=scores.shape)
    weights = scores + noise + 1e-6
    probabilities = weights / weights.sum()
    k = min(k, len(content_model.resource_ids))
    indices = np.random.choice(len(content_model.resource_ids), size=k, replace=False, p=probabilities)
    return [content_model.resource_ids[index] for index in indices]


def register_recommendation_commands(app: Flask) -> None:
    @app.cli.command("seed-interactions")
    @click.option("--count", default=25, show_default=True, help="Number of synthetic students to create.")
    @click.option("--reset", is_flag=True, help="Delete existing synthetic students before seeding.")
    def seed_interactions(count: int, reset: bool) -> None:
        """Create synthetic students with plausible bookmarks/interactions to bootstrap collaborative filtering."""
        if reset:
            removed = _delete_seed_users()
            if removed:
                click.echo(f"Removed {removed} existing synthetic student(s).")

        content_model = ContentModel.build()
        if content_model is None:
            raise click.ClickException("No resources are loaded. Run `import-resources` first.")

        existing_seed_count = User.query.filter_by(is_seed_user=True).count()
        created_users = 0
        created_bookmarks = 0
        created_interactions = 0

        for offset in range(count):
            index = existing_seed_count + offset + 1
            # Standard PRNG is intentional: these are non-security demo samples.
            field_of_study, skills, learning_goals = random.choices(  # nosec B311
                SEED_PROFILES, weights=SEED_PROFILE_WEIGHTS, k=1
            )[0]
            email = f"seed{index:04d}@{SEED_EMAIL_DOMAIN}"

            user = User(
                name=f"Seed Student {index}",
                email=email,
                onboarding_complete=True,
                is_seed_user=True,
            )
            # Synthetic recommender users must never have predictable login
            # credentials, even if a seed database reaches another environment.
            user.set_password(secrets.token_urlsafe(32))
            db.session.add(user)
            db.session.flush()

            db.session.add(
                Preference(
                    user_id=user.id,
                    field_of_study=field_of_study,
                    skills=skills,
                    learning_goals=learning_goals,
                )
            )

            profile_text = f"{field_of_study} {skills} {learning_goals}"
            touched_count = random.randint(  # nosec B311
                MIN_TOUCHED_RESOURCES,
                MAX_TOUCHED_RESOURCES,
            )
            resource_ids = _sample_resource_ids(content_model, profile_text, touched_count)

            for resource_id in resource_ids:
                db.session.add(Interaction(user_id=user.id, resource_id=resource_id, interaction_type="view"))
                created_interactions += 1
                if random.random() < CLICK_PROBABILITY:  # nosec B311
                    db.session.add(
                        Interaction(user_id=user.id, resource_id=resource_id, interaction_type="outbound_click")
                    )
                    created_interactions += 1
                if random.random() < BOOKMARK_PROBABILITY:  # nosec B311
                    db.session.add(Bookmark(user_id=user.id, resource_id=resource_id))
                    created_bookmarks += 1

            created_users += 1

        db.session.commit()
        invalidate_cache()

        click.echo(f"Created {created_users} synthetic student(s).")
        click.echo(f"Created {created_interactions} interaction event(s).")
        click.echo(f"Created {created_bookmarks} bookmark(s).")
        click.echo("Run `retrain-recommender` to train the collaborative model on this data.")

    @app.cli.command("retrain-recommender")
    def retrain_recommender() -> None:
        """Rebuild the content and collaborative recommendation models from the current database."""
        invalidate_cache()
        stats = warm_cache()

        resource_count = Resource.query.count()
        interaction_count = Interaction.query.count()
        bookmark_count = Bookmark.query.count()

        click.echo(f"Resources indexed: {stats['resourceCount']} (of {resource_count} in catalogue)")
        click.echo(f"Bookmarks: {bookmark_count}, interactions: {interaction_count}")
        if stats["collaborativeTrained"]:
            click.echo("Collaborative model: trained.")
        else:
            click.echo("Collaborative model: not trained (insufficient interaction data yet).")
