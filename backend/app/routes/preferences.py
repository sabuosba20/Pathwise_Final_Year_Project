from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import select

from ..extensions import db, limiter
from ..models import Preference, User
from ..services.cv_extraction import CvExtractionError, extract_cv_profile
from ..validation import json_object, text_value


preferences_bp = Blueprint("preferences", __name__)


@preferences_bp.post("/cv-extract")
@jwt_required()
@limiter.limit("5 per hour")
def extract_cv():
    cv_file = request.files.get("cv")
    if cv_file is None or not cv_file.filename:
        return jsonify(message="Choose a PDF or DOCX CV to upload."), 400

    try:
        result = extract_cv_profile(
            cv_file.stream,
            cv_file.filename,
            current_app.config["MAX_CV_UPLOAD_BYTES"],
        )
    except CvExtractionError as error:
        return jsonify(message=str(error)), error.status_code

    return jsonify(
        message="Review the detected details before saving.",
        **result,
    )


@preferences_bp.get("")
@jwt_required()
def get_preferences():
    user_id = int(get_jwt_identity())
    preference = db.session.execute(
        select(Preference).where(Preference.user_id == user_id)
    ).scalar_one_or_none()

    if preference is None:
        return jsonify(preference=None)

    return jsonify(
        preference={
            "fieldOfStudy": preference.field_of_study,
            "skills": preference.skills,
            "learningGoals": preference.learning_goals,
        }
    )


@preferences_bp.put("")
@jwt_required()
def save_preferences():
    payload = json_object()
    if payload is None:
        return jsonify(message="Request body must be a JSON object."), 400
    field_of_study, error = text_value(
        payload,
        "fieldOfStudy",
        maximum=160,
        required=True,
    )
    if error:
        raw_field_of_study = payload.get("fieldOfStudy")
        if raw_field_of_study is None or raw_field_of_study == "":
            return jsonify(message="Field of study and skills are required."), 400
        return jsonify(message=error), 400
    skills, error = text_value(payload, "skills", maximum=2000, required=True)
    if error:
        raw_skills = payload.get("skills")
        if raw_skills is None or raw_skills == "":
            return jsonify(message="Field of study and skills are required."), 400
        return jsonify(message=error), 400
    learning_goals, error = text_value(payload, "learningGoals", maximum=2000)
    if error:
        return jsonify(message=error), 400

    user = db.session.get(User, int(get_jwt_identity()))
    if not user:
        return jsonify(message="User not found."), 404

    preference = user.preference or Preference(user=user)
    preference.field_of_study = field_of_study
    preference.skills = skills
    preference.learning_goals = learning_goals
    user.onboarding_complete = True
    db.session.add(preference)
    db.session.commit()

    return jsonify(message="Preferences saved.", user=user.to_dict())
