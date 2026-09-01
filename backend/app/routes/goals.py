from datetime import date, datetime, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import select

from ..extensions import db
from ..models import CourseCompletion, Goal, Resource
from ..validation import json_object, text_value


goals_bp = Blueprint("goals", __name__)

VALID_STATUSES = {"active", "completed", "abandoned"}
MAX_SUGGESTED_COURSES = 6


def _current_user_id():
    return int(get_jwt_identity())


def _fetch_resource_rows():
    """Load minimal resource metadata once per request so listing many goals
    does not re-scan the whole catalogue for each one."""
    return db.session.execute(
        select(Resource.id, Resource.title, Resource.provider, Resource.rating, Resource.skills, Resource.field_tags)
    ).all()


def _matching_resources(target_tags, resource_rows):
    normalized_targets = {tag.lower() for tag in target_tags if tag}
    if not normalized_targets:
        return []

    matched = []
    for resource_id, title, provider, rating, skills, field_tags in resource_rows:
        resource_tags = {
            tag.strip().lower()
            for tag in f"{skills or ''},{field_tags or ''}".split(",")
            if tag.strip()
        }
        if resource_tags & normalized_targets:
            matched.append({"id": resource_id, "title": title, "provider": provider, "rating": rating})
    return matched


def _goal_view(goal, matched, completed_ids):
    matched_ids = {resource["id"] for resource in matched}
    goal_completed_ids = completed_ids & matched_ids

    suggested_courses = sorted(
        (resource for resource in matched if resource["id"] not in goal_completed_ids),
        key=lambda resource: (resource["rating"] is None, -(resource["rating"] or 0)),
    )[:MAX_SUGGESTED_COURSES]

    return goal.to_dict(
        completed_count=len(goal_completed_ids),
        total_matched=len(matched_ids),
        suggested_courses=suggested_courses,
    )


def _completed_resource_ids(user_id, resource_ids):
    if not resource_ids:
        return set()
    return set(
        db.session.execute(
            select(CourseCompletion.resource_id).where(
                CourseCompletion.user_id == user_id,
                CourseCompletion.resource_id.in_(resource_ids),
            )
        ).scalars()
    )


def _goal_dict(goal, user_id, resource_rows):
    """Serialise a single goal. Callers rendering many goals at once should
    use `_goal_view` with a batched completion lookup instead, to avoid one
    CourseCompletion query per goal."""
    matched = _matching_resources(Goal.split_tags(goal.target_tags), resource_rows)
    matched_ids = [resource["id"] for resource in matched]
    completed_ids = _completed_resource_ids(user_id, matched_ids)
    return _goal_view(goal, matched, completed_ids)


def _parse_target_date(payload):
    raw = payload.get("targetDate")
    if raw in (None, ""):
        return None, None
    if not isinstance(raw, str):
        return None, "targetDate must be a date string."
    try:
        return date.fromisoformat(raw), None
    except ValueError:
        return None, "targetDate must be a valid date (YYYY-MM-DD)."


def _find_goal(goal_id, user_id):
    return db.session.execute(
        select(Goal).where(Goal.id == goal_id, Goal.user_id == user_id)
    ).scalar_one_or_none()


@goals_bp.get("")
@jwt_required()
def list_goals():
    user_id = _current_user_id()
    status_filter = request.args.get("status", "").strip().lower()
    if status_filter and status_filter not in VALID_STATUSES:
        return jsonify(message=f"status must be one of: {', '.join(sorted(VALID_STATUSES))}."), 400

    statement = select(Goal).where(Goal.user_id == user_id)
    if status_filter:
        statement = statement.where(Goal.status == status_filter)
    statement = statement.order_by(Goal.status.asc(), Goal.created_at.desc())

    goals = db.session.execute(statement).scalars().all()
    resource_rows = _fetch_resource_rows()
    matches = [
        (goal, _matching_resources(Goal.split_tags(goal.target_tags), resource_rows))
        for goal in goals
    ]
    all_matched_ids = {resource["id"] for _, matched in matches for resource in matched}
    completed_ids = _completed_resource_ids(user_id, all_matched_ids)

    return jsonify(
        goals=[_goal_view(goal, matched, completed_ids) for goal, matched in matches]
    )


@goals_bp.post("")
@jwt_required()
def create_goal():
    payload = json_object()
    if payload is None:
        return jsonify(message="Request body must be a JSON object."), 400

    title, error = text_value(payload, "title", maximum=160, required=True)
    if error:
        return jsonify(message=error), 400
    target_tags, error = text_value(payload, "targetTags", maximum=500)
    if error:
        return jsonify(message=error), 400
    target_date, error = _parse_target_date(payload)
    if error:
        return jsonify(message=error), 400

    user_id = _current_user_id()
    goal = Goal(
        user_id=user_id,
        title=title,
        target_tags=target_tags,
        target_date=target_date,
    )
    db.session.add(goal)
    db.session.commit()

    return jsonify(message="Goal created.", goal=_goal_dict(goal, user_id, _fetch_resource_rows())), 201


@goals_bp.patch("/<int:goal_id>")
@jwt_required()
def update_goal(goal_id):
    user_id = _current_user_id()
    goal = _find_goal(goal_id, user_id)
    if goal is None:
        return jsonify(message="Goal not found."), 404

    payload = json_object()
    if payload is None:
        return jsonify(message="Request body must be a JSON object."), 400

    if "title" in payload:
        title, error = text_value(payload, "title", maximum=160, required=True)
        if error:
            return jsonify(message=error), 400
        goal.title = title

    if "targetTags" in payload:
        target_tags, error = text_value(payload, "targetTags", maximum=500, required=True)
        if error:
            return jsonify(message=error), 400
        goal.target_tags = target_tags

    if "targetDate" in payload:
        target_date, error = _parse_target_date(payload)
        if error:
            return jsonify(message=error), 400
        goal.target_date = target_date

    if "status" in payload:
        status_value = payload.get("status")
        if not isinstance(status_value, str) or status_value.strip().lower() not in VALID_STATUSES:
            return jsonify(message=f"status must be one of: {', '.join(sorted(VALID_STATUSES))}."), 400
        status_value = status_value.strip().lower()
        goal.status = status_value
        goal.completed_at = datetime.now(timezone.utc) if status_value == "completed" else None

    db.session.commit()
    return jsonify(message="Goal updated.", goal=_goal_dict(goal, user_id, _fetch_resource_rows()))


@goals_bp.delete("/<int:goal_id>")
@jwt_required()
def delete_goal(goal_id):
    user_id = _current_user_id()
    goal = _find_goal(goal_id, user_id)
    if goal is not None:
        db.session.delete(goal)
        db.session.commit()
    return jsonify(message="Goal deleted.")
