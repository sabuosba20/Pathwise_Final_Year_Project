from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models import Bookmark, Interaction, Resource
from ..services import invalidate_collaborative_cache, record_impression_outcome
from ..validation import json_object


engagement_bp = Blueprint("engagement", __name__)

INTERACTION_TYPES = {"view", "outbound_click"}


def _current_user_id():
    return int(get_jwt_identity())


@engagement_bp.post("/bookmarks/<int:resource_id>")
@jwt_required()
def create_bookmark(resource_id):
    if db.session.get(Resource, resource_id) is None:
        return jsonify(message="Resource not found."), 404

    user_id = _current_user_id()
    existing = Bookmark.query.filter_by(
        user_id=user_id,
        resource_id=resource_id,
    ).one_or_none()
    if existing:
        return jsonify(resourceId=resource_id, isBookmarked=True), 200

    db.session.add(Bookmark(user_id=user_id, resource_id=resource_id))
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify(resourceId=resource_id, isBookmarked=True), 200
    invalidate_collaborative_cache()
    record_impression_outcome(user_id, resource_id, "saved_at")
    return jsonify(resourceId=resource_id, isBookmarked=True), 201


@engagement_bp.delete("/bookmarks/<int:resource_id>")
@jwt_required()
def delete_bookmark(resource_id):
    user_id = _current_user_id()
    bookmark = Bookmark.query.filter_by(
        user_id=user_id,
        resource_id=resource_id,
    ).one_or_none()
    if bookmark:
        db.session.delete(bookmark)
        db.session.commit()
        invalidate_collaborative_cache()

    return jsonify(resourceId=resource_id, isBookmarked=False)


@engagement_bp.post("/interactions")
@jwt_required()
def create_interaction():
    payload = json_object()
    if payload is None:
        return jsonify(message="Request body must be a JSON object."), 400
    resource_id = payload.get("resourceId")
    interaction_type = payload.get("type", "")

    if isinstance(resource_id, bool) or not isinstance(resource_id, int):
        return jsonify(message="resourceId must be an integer."), 400
    if not isinstance(interaction_type, str):
        return jsonify(message="type must be text."), 400
    interaction_type = interaction_type.strip().lower()
    if interaction_type not in INTERACTION_TYPES:
        allowed = ", ".join(sorted(INTERACTION_TYPES))
        return jsonify(message=f"type must be one of: {allowed}."), 400
    if db.session.get(Resource, resource_id) is None:
        return jsonify(message="Resource not found."), 404

    user_id = _current_user_id()
    interaction = Interaction(
        user_id=user_id,
        resource_id=resource_id,
        interaction_type=interaction_type,
    )
    db.session.add(interaction)
    db.session.commit()
    if interaction_type == "outbound_click":
        # "view" is high-frequency and low-signal (weight 1, deduped by
        # _implicit_ratings' max()), so invalidating the collaborative model
        # for it would rebuild the model on nearly every page load. Only the
        # more deliberate "outbound_click" (weight 3) is worth the rebuild.
        invalidate_collaborative_cache()
        record_impression_outcome(user_id, resource_id, "opened_at")

    return jsonify(
        interaction={
            "id": interaction.id,
            "resourceId": interaction.resource_id,
            "type": interaction.interaction_type,
            "createdAt": interaction.created_at.isoformat(),
        }
    ), 201
