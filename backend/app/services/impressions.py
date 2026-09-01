from datetime import datetime, timezone

from sqlalchemy import desc, select

from ..extensions import db
from ..models import RecommendationImpression


def record_impressions(user_id, recommendations, algorithm_version):
    for rank, item in enumerate(recommendations, start=1):
        db.session.add(
            RecommendationImpression(
                user_id=user_id,
                resource_id=item["resource"]["id"],
                rank=rank,
                algorithm_version=algorithm_version,
                reason=item.get("reason"),
            )
        )
    db.session.commit()


def record_impression_outcome(user_id, resource_id, field):
    column = getattr(RecommendationImpression, field)
    impression = db.session.execute(
        select(RecommendationImpression)
        .where(
            RecommendationImpression.user_id == user_id,
            RecommendationImpression.resource_id == resource_id,
            column.is_(None),
        )
        .order_by(desc(RecommendationImpression.shown_at))
    ).scalars().first()
    if impression is None:
        return
    setattr(impression, field, datetime.now(timezone.utc))
    db.session.commit()
