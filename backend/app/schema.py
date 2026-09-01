from sqlalchemy import inspect, text

from .extensions import db
from .models import RecommendationImpression, User


def ensure_user_profile_columns():
    """Add structured personal-detail columns to an existing user table."""
    inspector = inspect(db.engine)
    if not inspector.has_table(User.__tablename__):
        return []

    existing = {column["name"] for column in inspector.get_columns(User.__tablename__)}
    required = ["first_name", "last_name", "date_of_birth"]
    missing = [name for name in required if name not in existing]
    if not missing:
        return []

    preparer = db.engine.dialect.identifier_preparer
    table_name = preparer.quote(User.__tablename__)
    with db.engine.begin() as connection:
        for name in missing:
            column = User.__table__.columns[name]
            column_name = preparer.quote(name)
            type_sql = column.type.compile(dialect=db.engine.dialect)
            connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {type_sql}"))

    return missing


def ensure_recommendation_impression_columns():
    """Add newly introduced outcome columns to an existing impression table."""
    inspector = inspect(db.engine)
    if not inspector.has_table(RecommendationImpression.__tablename__):
        return []

    existing = {
        column["name"]
        for column in inspector.get_columns(
            RecommendationImpression.__tablename__
        )
    }
    required = ["completed_at"]
    missing = [name for name in required if name not in existing]
    if not missing:
        return []

    preparer = db.engine.dialect.identifier_preparer
    table_name = preparer.quote(RecommendationImpression.__tablename__)
    with db.engine.begin() as connection:
        for name in missing:
            column = RecommendationImpression.__table__.columns[name]
            column_name = preparer.quote(name)
            type_sql = column.type.compile(dialect=db.engine.dialect)
            connection.execute(
                text(
                    f"ALTER TABLE {table_name} "
                    f"ADD COLUMN {column_name} {type_sql}"
                )
            )

    return missing
