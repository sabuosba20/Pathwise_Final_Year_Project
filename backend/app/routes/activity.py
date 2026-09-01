from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func, select

from ..extensions import db
from ..models import Bookmark, CourseCompletion, Interaction, Resource
from ..services import distinct_interaction_count, weight_for_confidence


activity_bp = Blueprint("activity", __name__)

VALID_TYPES = {"all", "completed", "saved", "viewed", "clicked"}


def _positive_integer(name, default, maximum=None):
    raw_value = request.args.get(name)
    if raw_value is None:
        return default, None
    try:
        value = int(raw_value)
    except ValueError:
        return None, f"{name} must be a positive integer."
    if value < 1:
        return None, f"{name} must be a positive integer."
    if maximum is not None and value > maximum:
        return None, f"{name} cannot be greater than {maximum}."
    return value, None


def _empty_entry(resource_id):
    return {
        "resourceId": resource_id,
        "isBookmarked": False,
        "bookmarkedAt": None,
        "isCompleted": False,
        "completedAt": None,
        "viewCount": 0,
        "viewLastAt": None,
        "clickCount": 0,
        "clickLastAt": None,
    }


@activity_bp.get("")
@jwt_required()
def list_activity():
    user_id = int(get_jwt_identity())

    page, error = _positive_integer("page", default=1)
    if error:
        return jsonify(message=error), 400
    per_page, error = _positive_integer("per_page", default=12, maximum=24)
    if error:
        return jsonify(message=error), 400

    activity_type = request.args.get("type", "all").strip().lower()
    if activity_type not in VALID_TYPES:
        return jsonify(message=f"type must be one of: {', '.join(sorted(VALID_TYPES))}."), 400

    entries = {}

    bookmark_rows = db.session.execute(
        select(Bookmark.resource_id, Bookmark.created_at).where(Bookmark.user_id == user_id)
    )
    for resource_id, created_at in bookmark_rows:
        entry = entries.setdefault(resource_id, _empty_entry(resource_id))
        entry["isBookmarked"] = True
        entry["bookmarkedAt"] = created_at

    completion_rows = db.session.execute(
        select(
            CourseCompletion.resource_id,
            CourseCompletion.completed_at,
        ).where(CourseCompletion.user_id == user_id)
    )
    for resource_id, completed_at in completion_rows:
        entry = entries.setdefault(resource_id, _empty_entry(resource_id))
        entry["isCompleted"] = True
        entry["completedAt"] = completed_at

    interaction_rows = db.session.execute(
        select(
            Interaction.resource_id,
            Interaction.interaction_type,
            func.count(Interaction.id),
            func.max(Interaction.created_at),
        )
        .where(Interaction.user_id == user_id)
        .group_by(Interaction.resource_id, Interaction.interaction_type)
    )
    for resource_id, interaction_type, count, last_at in interaction_rows:
        entry = entries.setdefault(resource_id, _empty_entry(resource_id))
        if interaction_type == "view":
            entry["viewCount"] = count
            entry["viewLastAt"] = last_at
        elif interaction_type == "outbound_click":
            entry["clickCount"] = count
            entry["clickLastAt"] = last_at

    # Not len(entries): must match the recommender's own count exactly, including
    # recommendation-feedback signals that never produce an activity-list row.
    interaction_count = distinct_interaction_count(user_id)

    for entry in entries.values():
        timestamps = [
            timestamp
            for timestamp in (
                entry["completedAt"],
                entry["bookmarkedAt"],
                entry["viewLastAt"],
                entry["clickLastAt"],
            )
            if timestamp
        ]
        entry["lastActivityAt"] = max(timestamps) if timestamps else None
        if entry["isCompleted"]:
            entry["strongestSignal"] = "completed"
        elif entry["isBookmarked"]:
            entry["strongestSignal"] = "saved"
        elif entry["clickCount"] > 0:
            entry["strongestSignal"] = "clicked"
        else:
            entry["strongestSignal"] = "viewed"

    if activity_type == "completed":
        filtered = [entry for entry in entries.values() if entry["isCompleted"]]
    elif activity_type == "saved":
        filtered = [entry for entry in entries.values() if entry["isBookmarked"]]
    elif activity_type == "viewed":
        filtered = [entry for entry in entries.values() if entry["viewCount"] > 0]
    elif activity_type == "clicked":
        filtered = [entry for entry in entries.values() if entry["clickCount"] > 0]
    else:
        filtered = list(entries.values())
    ordered = sorted(filtered, key=lambda entry: entry["lastActivityAt"], reverse=True)

    total = len(ordered)
    pages = (total + per_page - 1) // per_page if total else 0
    start = (page - 1) * per_page
    page_entries = ordered[start : start + per_page]

    resource_ids = [entry["resourceId"] for entry in page_entries]
    resources_by_id = {
        resource.id: resource
        for resource in db.session.execute(select(Resource).where(Resource.id.in_(resource_ids))).scalars()
    }

    activity = []
    for entry in page_entries:
        resource = resources_by_id.get(entry["resourceId"])
        if resource is None:
            continue
        activity.append(
            {
                "resource": resource.to_dict(
                    is_bookmarked=entry["isBookmarked"],
                    completed_at=entry["completedAt"],
                ),
                "viewCount": entry["viewCount"],
                "outboundClickCount": entry["clickCount"],
                "completedAt": (
                    entry["completedAt"].isoformat()
                    if entry["completedAt"]
                    else None
                ),
                "strongestSignal": entry["strongestSignal"],
                "lastActivityAt": entry["lastActivityAt"].isoformat() if entry["lastActivityAt"] else None,
            }
        )

    weight_content, weight_collaborative = weight_for_confidence(interaction_count)

    return jsonify(
        activity=activity,
        pagination={
            "page": page,
            "perPage": per_page,
            "total": total,
            "pages": pages,
            "hasNext": page * per_page < total,
            "hasPrevious": page > 1,
        },
        stats={
            "interactionCount": interaction_count,
            "weightContent": round(weight_content, 4),
            "weightCollaborative": round(weight_collaborative, 4),
        },
    )
