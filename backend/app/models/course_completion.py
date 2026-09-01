from datetime import datetime, timezone

from ..extensions import db


class CourseCompletion(db.Model):
    __table_args__ = (
        db.UniqueConstraint(
            "user_id",
            "resource_id",
            name="uq_course_completion_user_resource",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id"),
        nullable=False,
        index=True,
    )
    resource_id = db.Column(
        db.Integer,
        db.ForeignKey("resource.id"),
        nullable=False,
        index=True,
    )
    completed_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    user = db.relationship("User", back_populates="course_completions")
    resource = db.relationship("Resource", back_populates="course_completions")
