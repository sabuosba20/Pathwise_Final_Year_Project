from ..extensions import db


class Resource(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    provider = db.Column(db.String(120), nullable=False, index=True)
    url = db.Column(db.String(500), unique=True, nullable=False)
    description = db.Column(db.Text, nullable=False, default="")
    category = db.Column(db.String(120), nullable=False, default="General", index=True)
    difficulty = db.Column(db.String(40), nullable=False, default="Unknown", index=True)
    rating = db.Column(db.Float, nullable=True)
    resource_type = db.Column(db.String(80), nullable=False, default="Course", index=True)
    skills = db.Column(db.Text, nullable=False, default="")
    field_tags = db.Column(db.Text, nullable=False, default="")
    search_text = db.Column(db.Text, nullable=False, default="")

    bookmarks = db.relationship("Bookmark", back_populates="resource", cascade="all, delete-orphan")
    course_completions = db.relationship(
        "CourseCompletion",
        back_populates="resource",
        cascade="all, delete-orphan",
    )
    interactions = db.relationship("Interaction", back_populates="resource", cascade="all, delete-orphan")
    recommendation_feedback = db.relationship(
        "RecommendationFeedback",
        back_populates="resource",
        cascade="all, delete-orphan",
    )
    recommendation_impressions = db.relationship(
        "RecommendationImpression",
        back_populates="resource",
        cascade="all, delete-orphan",
    )
    user_ratings = db.relationship(
        "ResourceRating",
        back_populates="resource",
        cascade="all, delete-orphan",
    )

    @staticmethod
    def _split_values(value):
        return [item.strip() for item in (value or "").split(",") if item.strip()]

    def to_dict(self, is_bookmarked=False, completed_at=None):
        return {
            "id": self.id,
            "title": self.title,
            "provider": self.provider,
            "url": self.url,
            "description": self.description,
            "category": self.category,
            "difficulty": self.difficulty,
            "rating": self.rating,
            "resourceType": self.resource_type,
            "skills": self._split_values(self.skills),
            "fieldTags": self._split_values(self.field_tags),
            "isBookmarked": is_bookmarked,
            "isCompleted": completed_at is not None,
            "completedAt": completed_at.isoformat() if completed_at else None,
        }
