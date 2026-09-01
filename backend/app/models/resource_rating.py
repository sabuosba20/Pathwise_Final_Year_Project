from datetime import datetime, timezone

from ..extensions import db


class ResourceRating(db.Model):
    __table_args__ = (
        db.UniqueConstraint(
            "user_id",
            "resource_id",
            name="uq_resource_rating_user_resource",
        ),
        db.CheckConstraint(
            "rating >= 1 AND rating <= 5",
            name="ck_resource_rating_value",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    resource_id = db.Column(db.Integer, db.ForeignKey("resource.id"), nullable=False, index=True)
    rating = db.Column(db.Integer, nullable=False)
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

    user = db.relationship("User", back_populates="resource_ratings")
    resource = db.relationship("Resource", back_populates="user_ratings")

