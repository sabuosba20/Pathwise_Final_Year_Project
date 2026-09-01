import sqlite3

from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event
from sqlalchemy.engine import Engine


@event.listens_for(Engine, "connect")
def enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
    """Enforce declared foreign keys on every SQLite connection.

    SQLite disables this protection by default and the setting is scoped to
    each connection. The type check keeps this hook harmless if Pathwise later
    moves to PostgreSQL or another database engine.
    """
    if not isinstance(dbapi_connection, sqlite3.Connection):
        return

    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()


db = SQLAlchemy()
jwt = JWTManager()
limiter = Limiter(key_func=get_remote_address)
