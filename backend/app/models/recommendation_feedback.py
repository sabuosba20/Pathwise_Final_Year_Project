from datetime import datetime, timezone

from ..extensions import db


class RecommendationFeedback(db.Model):
    __table_args__ = (
        db.UniqueConstraint(
            "user_id",
            "resource_id",
            name="uq_recommendation_feedback_user_resource",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    resource_id = db.Column(db.Integer, db.ForeignKey("resource.id"), nullable=False)
    feedback_type = db.Column(db.String(32), nullable=False)
    recommendation_rank = db.Column(db.Integer, nullable=True)
    recommendation_reason = db.Column(db.Text, nullable=True)
    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = db.relationship("User", back_populates="recommendation_feedback")
    resource = db.relationship("Resource", back_populates="recommendation_feedback")

    def to_dict(self):
        return {
            "resourceId": self.resource_id,
            "type": self.feedback_type,
            "recommendationRank": self.recommendation_rank,
            "recommendationReason": self.recommendation_reason,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }
