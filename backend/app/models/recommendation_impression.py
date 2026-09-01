from datetime import datetime, timezone

from ..extensions import db


class RecommendationImpression(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    resource_id = db.Column(db.Integer, db.ForeignKey("resource.id"), nullable=False, index=True)
    rank = db.Column(db.Integer, nullable=False)
    algorithm_version = db.Column(db.String(40), nullable=False)
    reason = db.Column(db.Text, nullable=True)
    shown_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    opened_at = db.Column(db.DateTime, nullable=True)
    saved_at = db.Column(db.DateTime, nullable=True)
    dismissed_at = db.Column(db.DateTime, nullable=True)
    more_like_this_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User", back_populates="recommendation_impressions")
    resource = db.relationship("Resource", back_populates="recommendation_impressions")
