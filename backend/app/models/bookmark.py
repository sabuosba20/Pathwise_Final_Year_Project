from datetime import datetime, timezone

from ..extensions import db


class Bookmark(db.Model):
    __table_args__ = (db.UniqueConstraint("user_id", "resource_id", name="uq_bookmark_user_resource"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    resource_id = db.Column(db.Integer, db.ForeignKey("resource.id"), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    user = db.relationship("User", back_populates="bookmarks")
    resource = db.relationship("Resource", back_populates="bookmarks")

