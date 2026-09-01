from datetime import datetime, timezone

from ..extensions import db


class Goal(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    title = db.Column(db.String(160), nullable=False)
    target_tags = db.Column(db.Text, nullable=False, default="")
    target_date = db.Column(db.Date, nullable=True)
    status = db.Column(db.String(20), nullable=False, default="active", index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    completed_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User", back_populates="goals")

    @staticmethod
    def split_tags(value):
        return [item.strip() for item in (value or "").split(",") if item.strip()]

    def to_dict(self, *, completed_count=0, total_matched=0, suggested_courses=None):
        if not total_matched:
            percent = 0
        else:
            # Round to the nearest whole percent, but never let real, nonzero
            # progress (e.g. 1 of 483) display as a misleading 0%.
            percent = max(round((completed_count / total_matched) * 100), 1 if completed_count else 0)
        return {
            "id": self.id,
            "title": self.title,
            "targetTags": self.split_tags(self.target_tags),
            "targetDate": self.target_date.isoformat() if self.target_date else None,
            "status": self.status,
            "createdAt": self.created_at.isoformat(),
            "completedAt": self.completed_at.isoformat() if self.completed_at else None,
            "progress": {
                "completedCount": completed_count,
                "totalMatched": total_matched,
                "percent": percent,
                "suggestedCourses": suggested_courses or [],
            },
        }
