from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import asc, desc, func, nulls_last, or_, select
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models import Bookmark, CourseCompletion, Resource, ResourceRating
from ..services import invalidate_collaborative_cache, record_impression_outcome
from ..validation import json_object


resources_bp = Blueprint("resources", __name__)

SORT_OPTIONS = {
    "rating": (nulls_last(desc(Resource.rating)), asc(func.lower(Resource.title))),
    "title": (asc(func.lower(Resource.title)),),
    "provider": (asc(func.lower(Resource.provider)), asc(func.lower(Resource.title))),
}


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


def _clean_query_parameter(name, maximum=160):
    value = request.args.get(name, "").strip()
    if len(value) > maximum:
        return None, f"{name} cannot be longer than {maximum} characters."
    return value, None


def _literal_contains_pattern(value):
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _distinct_values(column):
    statement = select(column).where(column.is_not(None), column != "").distinct().order_by(column)
    return list(db.session.execute(statement).scalars())


def _distinct_tags():
    rows = db.session.execute(select(Resource.skills, Resource.field_tags)).all()
    seen = {}
    for skills, field_tags in rows:
        for tag in f"{skills or ''},{field_tags or ''}".split(","):
            tag = tag.strip()
            if tag:
                seen.setdefault(tag.lower(), tag)
    return sorted(seen.values(), key=str.lower)


def _rating_summary(resource_id, user_id):
    average, count = db.session.execute(
        select(
            func.avg(ResourceRating.rating),
            func.count(ResourceRating.id),
        ).where(ResourceRating.resource_id == resource_id)
    ).one()
    user_rating = db.session.execute(
        select(ResourceRating.rating).where(
            ResourceRating.user_id == user_id,
            ResourceRating.resource_id == resource_id,
        )
    ).scalar_one_or_none()
    return {
        "userRating": user_rating,
        "pathwiseRating": round(float(average), 1) if average is not None else None,
        "pathwiseRatingCount": int(count),
    }


def _completion_for_user(resource_id, user_id):
    return db.session.execute(
        select(CourseCompletion).where(
            CourseCompletion.user_id == user_id,
            CourseCompletion.resource_id == resource_id,
        )
    ).scalar_one_or_none()


@resources_bp.get("/tags")
@jwt_required()
def list_tags():
    return jsonify(tags=_distinct_tags())


@resources_bp.get("")
@jwt_required()
def list_resources():
    user_id = int(get_jwt_identity())
    page, error = _positive_integer("page", default=1)
    if error:
        return jsonify(message=error), 400

    per_page, error = _positive_integer("per_page", default=12, maximum=24)
    if error:
        return jsonify(message=error), 400

    query, error = _clean_query_parameter("q")
    if error:
        return jsonify(message=error), 400

    filters = {}
    for parameter, column in {
        "provider": Resource.provider,
        "category": Resource.category,
        "difficulty": Resource.difficulty,
        "resource_type": Resource.resource_type,
    }.items():
        value, error = _clean_query_parameter(parameter)
        if error:
            return jsonify(message=error), 400
        filters[parameter] = (value, column)

    sort_key = request.args.get("sort", "rating").strip().lower()
    if sort_key not in {*SORT_OPTIONS, "completed"}:
        return jsonify(
            message=f"sort must be one of: {', '.join([*SORT_OPTIONS, 'completed'])}."
        ), 400

    bookmarked_value = request.args.get("bookmarked")
    if bookmarked_value is not None and bookmarked_value.lower() not in {"true", "false"}:
        return jsonify(message="bookmarked must be true or false."), 400
    bookmarked_only = bookmarked_value is not None and bookmarked_value.lower() == "true"

    completed_value = request.args.get("completed")
    if completed_value is not None and completed_value.lower() not in {"true", "false"}:
        return jsonify(message="completed must be true or false."), 400
    completed_only = completed_value is not None and completed_value.lower() == "true"
    if sort_key == "completed" and not completed_only:
        return jsonify(message="sort=completed requires completed=true."), 400

    statement = select(Resource)
    if bookmarked_only:
        statement = statement.join(Bookmark, Bookmark.resource_id == Resource.id).where(
            Bookmark.user_id == user_id
        )
    if completed_only:
        statement = statement.join(
            CourseCompletion,
            CourseCompletion.resource_id == Resource.id,
        ).where(CourseCompletion.user_id == user_id)
    if query:
        pattern = _literal_contains_pattern(query)
        statement = statement.where(
            or_(
                Resource.title.ilike(pattern, escape="\\"),
                Resource.description.ilike(pattern, escape="\\"),
                Resource.skills.ilike(pattern, escape="\\"),
                Resource.field_tags.ilike(pattern, escape="\\"),
                Resource.category.ilike(pattern, escape="\\"),
            )
        )

    for value, column in filters.values():
        if value:
            statement = statement.where(column == value)

    if sort_key == "completed":
        statement = statement.order_by(
            CourseCompletion.completed_at.desc(),
            Resource.id,
        )
    else:
        statement = statement.order_by(*SORT_OPTIONS[sort_key], Resource.id)
    pagination = db.paginate(statement, page=page, per_page=per_page, error_out=False)
    resource_ids = [resource.id for resource in pagination.items]
    bookmarked_ids = set()
    completion_dates = {}
    if resource_ids:
        bookmarked_ids = set(
            db.session.execute(
                select(Bookmark.resource_id).where(
                    Bookmark.user_id == user_id,
                    Bookmark.resource_id.in_(resource_ids),
                )
            ).scalars()
        )
        completion_dates = dict(
            db.session.execute(
                select(
                    CourseCompletion.resource_id,
                    CourseCompletion.completed_at,
                ).where(
                    CourseCompletion.user_id == user_id,
                    CourseCompletion.resource_id.in_(resource_ids),
                )
            ).all()
        )

    return jsonify(
        resources=[
            resource.to_dict(
                is_bookmarked=resource.id in bookmarked_ids,
                completed_at=completion_dates.get(resource.id),
            )
            for resource in pagination.items
        ],
        pagination={
            "page": pagination.page,
            "perPage": pagination.per_page,
            "total": pagination.total,
            "pages": pagination.pages,
            "hasNext": pagination.has_next,
            "hasPrevious": pagination.has_prev,
        },
        filterOptions={
            "providers": _distinct_values(Resource.provider),
            "categories": _distinct_values(Resource.category),
            "difficulties": _distinct_values(Resource.difficulty),
            "resourceTypes": _distinct_values(Resource.resource_type),
        },
    )


@resources_bp.get("/<int:resource_id>")
@jwt_required()
def get_resource(resource_id):
    user_id = int(get_jwt_identity())
    resource = db.session.get(Resource, resource_id)
    if not resource:
        return jsonify(message="Resource not found."), 404
    is_bookmarked = db.session.execute(
        select(Bookmark.id).where(
            Bookmark.user_id == user_id,
            Bookmark.resource_id == resource_id,
        )
    ).scalar_one_or_none() is not None
    completion = _completion_for_user(resource_id, user_id)
    serialized = resource.to_dict(
        is_bookmarked=is_bookmarked,
        completed_at=completion.completed_at if completion else None,
    )
    serialized.update(_rating_summary(resource_id, user_id))
    return jsonify(resource=serialized)


@resources_bp.post("/<int:resource_id>/completion")
@jwt_required()
def complete_resource(resource_id):
    user_id = int(get_jwt_identity())
    if db.session.get(Resource, resource_id) is None:
        return jsonify(message="Resource not found."), 404

    completion = _completion_for_user(resource_id, user_id)
    status_code = 200
    if completion is None:
        completion = CourseCompletion(
            user_id=user_id,
            resource_id=resource_id,
        )
        db.session.add(completion)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            completion = _completion_for_user(resource_id, user_id)
        else:
            invalidate_collaborative_cache()
            record_impression_outcome(user_id, resource_id, "completed_at")
            status_code = 201

    return jsonify(
        message="Course marked as completed.",
        completion={
            "isCompleted": True,
            "completedAt": completion.completed_at.isoformat(),
        },
    ), status_code


@resources_bp.delete("/<int:resource_id>/completion")
@jwt_required()
def undo_resource_completion(resource_id):
    user_id = int(get_jwt_identity())
    if db.session.get(Resource, resource_id) is None:
        return jsonify(message="Resource not found."), 404

    completion = _completion_for_user(resource_id, user_id)
    if completion is not None:
        db.session.delete(completion)
        db.session.commit()
        invalidate_collaborative_cache()

    return jsonify(
        message="Course completion removed.",
        completion={
            "isCompleted": False,
            "completedAt": None,
        },
    )


@resources_bp.put("/<int:resource_id>/rating")
@jwt_required()
def save_resource_rating(resource_id):
    user_id = int(get_jwt_identity())
    if db.session.get(Resource, resource_id) is None:
        return jsonify(message="Resource not found."), 404

    payload = json_object()
    if payload is None:
        return jsonify(message="Request body must be a JSON object."), 400
    rating_value = payload.get("rating")
    if (
        isinstance(rating_value, bool)
        or not isinstance(rating_value, int)
        or rating_value < 1
        or rating_value > 5
    ):
        return jsonify(message="rating must be a whole number between 1 and 5."), 400

    rating = ResourceRating.query.filter_by(
        user_id=user_id,
        resource_id=resource_id,
    ).one_or_none()
    status_code = 200
    if rating is None:
        rating = ResourceRating(
            user_id=user_id,
            resource_id=resource_id,
        )
        db.session.add(rating)
        status_code = 201

    rating.rating = rating_value
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        rating = ResourceRating.query.filter_by(
            user_id=user_id,
            resource_id=resource_id,
        ).one_or_none()
        rating.rating = rating_value
        db.session.commit()
        status_code = 200
    invalidate_collaborative_cache()
    return jsonify(
        message="Your rating was saved.",
        rating=_rating_summary(resource_id, user_id),
    ), status_code


@resources_bp.delete("/<int:resource_id>/rating")
@jwt_required()
def delete_resource_rating(resource_id):
    user_id = int(get_jwt_identity())
    if db.session.get(Resource, resource_id) is None:
        return jsonify(message="Resource not found."), 404

    rating = ResourceRating.query.filter_by(
        user_id=user_id,
        resource_id=resource_id,
    ).one_or_none()
    if rating is not None:
        db.session.delete(rating)
        db.session.commit()
        invalidate_collaborative_cache()

    return jsonify(
        message="Your rating was removed.",
        rating=_rating_summary(resource_id, user_id),
    )
