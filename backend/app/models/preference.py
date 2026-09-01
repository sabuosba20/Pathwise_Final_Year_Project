from ..extensions import db


class Preference(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), unique=True, nullable=False)
    field_of_study = db.Column(db.String(160), nullable=False)
    skills = db.Column(db.Text, nullable=False, default="")
    learning_goals = db.Column(db.Text, nullable=False, default="")

    user = db.relationship("User", back_populates="preference")

