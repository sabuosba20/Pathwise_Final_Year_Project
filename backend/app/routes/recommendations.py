from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from ..extensions import db
from ..models import RecommendationFeedback, Resource
from ..services import (
    ALGORITHM_VERSION,
    FALLBACK_ALGORITHM_VERSION,
    invalidate_collaborative_cache,
    recommend_for_user,
    record_impression_outcome,
    record_impressions,
)
from ..validation import json_object


recommendations_bp = Blueprint("recommendations", __name__)
FEEDBACK_TYPES = {"more_like_this", "not_interested"}
FEEDBACK_OUTCOME_FIELDS = {
    "more_like_this": "more_like_this_at",
    "not_interested": "dismissed_at",
}


@recommendations_bp.get("")
@jwt_required()
def list_recommendations():
    user_id = int(get_jwt_identity())

    raw_limit = request.args.get("limit", "12")
    try:
        limit = int(raw_limit)
    except ValueError:
        return jsonify(message="limit must be a positive integer."), 400
    if limit < 1 or limit > 24:
        return jsonify(message="limit must be between 1 and 24."), 400

    result = recommend_for_user(user_id, limit=limit)
    if result["recommendations"]:
        algorithm_version = ALGORITHM_VERSION if result["personalized"] else FALLBACK_ALGORITHM_VERSION
        record_impressions(user_id, result["recommendations"], algorithm_version)
    return jsonify(**result)


@recommendations_bp.post("/feedback")
@jwt_required()
def save_recommendation_feedback():
    user_id = int(get_jwt_identity())
    payload = json_object()
    if payload is None:
        return jsonify(message="Request body must be a JSON object."), 400
    resource_id = payload.get("resourceId")
    feedback_type = payload.get("type", "")
    recommendation_rank = payload.get("recommendationRank")
    recommendation_reason = payload.get("recommendationReason")

    if isinstance(resource_id, bool) or not isinstance(resource_id, int):
        return jsonify(message="resourceId must be an integer."), 400
    if not isinstance(feedback_type, str):
        return jsonify(message="type must be text."), 400
    feedback_type = feedback_type.strip().lower()
    if feedback_type not in FEEDBACK_TYPES:
        allowed = ", ".join(sorted(FEEDBACK_TYPES))
        return jsonify(message=f"type must be one of: {allowed}."), 400
    if recommendation_rank is not None and (
        isinstance(recommendation_rank, bool)
        or not isinstance(recommendation_rank, int)
        or recommendation_rank < 1
        or recommendation_rank > 24
    ):
        return jsonify(message="recommendationRank must be between 1 and 24."), 400
    if recommendation_reason is not None and not isinstance(recommendation_reason, str):
        return jsonify(message="recommendationReason must be a string."), 400
    if recommendation_reason and len(recommendation_reason.strip()) > 500:
        return jsonify(message="recommendationReason must be 500 characters or fewer."), 400
    if db.session.get(Resource, resource_id) is None:
        return jsonify(message="Resource not found."), 404

    feedback = RecommendationFeedback.query.filter_by(
        user_id=user_id,
        resource_id=resource_id,
    ).one_or_none()
    status_code = 200
    if feedback is None:
        feedback = RecommendationFeedback(
            user_id=user_id,
            resource_id=resource_id,
        )
        db.session.add(feedback)
        status_code = 201

    feedback.feedback_type = feedback_type
    feedback.recommendation_rank = recommendation_rank
    feedback.recommendation_reason = (
        recommendation_reason.strip() if recommendation_reason else None
    )
    db.session.commit()
    invalidate_collaborative_cache()
    record_impression_outcome(user_id, resource_id, FEEDBACK_OUTCOME_FIELDS[feedback_type])

    return jsonify(feedback=feedback.to_dict()), status_code


@recommendations_bp.delete("/feedback/<int:resource_id>")
@jwt_required()
def delete_recommendation_feedback(resource_id):
    user_id = int(get_jwt_identity())
    feedback = RecommendationFeedback.query.filter_by(
        user_id=user_id,
        resource_id=resource_id,
    ).one_or_none()
    if feedback is not None:
        db.session.delete(feedback)
        db.session.commit()
        invalidate_collaborative_cache()

    return jsonify(resourceId=resource_id, hasFeedback=False)
