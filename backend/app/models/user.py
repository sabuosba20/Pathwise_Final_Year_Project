import hashlib
from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    first_name = db.Column(db.String(80), nullable=True)
    last_name = db.Column(db.String(80), nullable=True)
    date_of_birth = db.Column(db.Date, nullable=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    onboarding_complete = db.Column(db.Boolean, nullable=False, default=False)
    is_seed_user = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    preference = db.relationship("Preference", back_populates="user", uselist=False, cascade="all, delete-orphan")
    bookmarks = db.relationship("Bookmark", back_populates="user", cascade="all, delete-orphan")
    course_completions = db.relationship(
        "CourseCompletion",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    goals = db.relationship("Goal", back_populates="user", cascade="all, delete-orphan")
    interactions = db.relationship("Interaction", back_populates="user", cascade="all, delete-orphan")
    recommendation_feedback = db.relationship(
        "RecommendationFeedback",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    recommendation_impressions = db.relationship(
        "RecommendationImpression",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    resource_ratings = db.relationship(
        "ResourceRating",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def auth_fingerprint(self):
        """Version authentication tokens without exposing the password hash."""
        return hashlib.sha256(self.password_hash.encode()).hexdigest()[:24]

    def to_dict(self):
        name_parts = self.name.strip().split(maxsplit=1)
        first_name = self.first_name or (name_parts[0] if name_parts else "")
        last_name = self.last_name or (name_parts[1] if len(name_parts) > 1 else "")
        return {
            "id": self.id,
            "name": f"{first_name} {last_name}".strip() or self.name,
            "firstName": first_name,
            "lastName": last_name,
            "dateOfBirth": self.date_of_birth.isoformat() if self.date_of_birth else "",
            "email": self.email,
            "onboardingComplete": self.onboarding_complete,
            "memberSince": self.created_at.isoformat(),
        }
