import os
import secrets
from datetime import timedelta

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

from .extensions import db, jwt, limiter


INSECURE_SECRET_MARKERS = ("change-me", "replace-this", "dev-secret")


def _is_insecure_secret(value):
    normalized = str(value or "").lower()
    return len(normalized) < 32 or any(marker in normalized for marker in INSECURE_SECRET_MARKERS)


def _comma_separated_env(name):
    return [item.strip() for item in os.getenv(name, "").split(",") if item.strip()]


def create_app(test_config=None):
    load_dotenv()

    app_environment = os.getenv("APP_ENV", "development").strip().lower()
    access_token_minutes = int(os.getenv("JWT_ACCESS_TOKEN_MINUTES", "30"))
    configured_secret_key = os.getenv("SECRET_KEY")
    configured_jwt_secret_key = os.getenv("JWT_SECRET_KEY")
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_mapping(
        APP_ENV=app_environment,
        # Development stays secure by default even before a local .env exists.
        # Production still requires explicit, stable values below.
        SECRET_KEY=configured_secret_key or secrets.token_urlsafe(48),
        JWT_SECRET_KEY=configured_jwt_secret_key or secrets.token_urlsafe(48),
        JWT_TOKEN_LOCATION=["cookies"],
        JWT_COOKIE_CSRF_PROTECT=True,
        JWT_COOKIE_SAMESITE="Strict",
        JWT_COOKIE_SECURE=app_environment == "production",
        JWT_SESSION_COOKIE=True,
        JWT_ACCESS_TOKEN_EXPIRES=timedelta(minutes=access_token_minutes),
        JWT_ALLOW_LEGACY_TOKENS=False,
        SQLALCHEMY_DATABASE_URI=os.getenv("DATABASE_URL", "sqlite:///pathwise.db"),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        # Leave room for multipart framing around a 5 MB CV upload.
        MAX_CONTENT_LENGTH=6 * 1024 * 1024,
        MAX_CV_UPLOAD_BYTES=5 * 1024 * 1024,
        RATELIMIT_STORAGE_URI=os.getenv("RATELIMIT_STORAGE_URI", "memory://"),
        RATELIMIT_HEADERS_ENABLED=True,
        TRUSTED_HOSTS=_comma_separated_env("TRUSTED_HOSTS") or None,
    )
    if test_config:
        app.config.update(test_config)
        # Existing unit tests intentionally exercise bearer-token API access.
        # Browser-facing production traffic remains cookie-only.
        if app.config.get("TESTING"):
            if "JWT_TOKEN_LOCATION" not in test_config:
                app.config["JWT_TOKEN_LOCATION"] = ["headers", "cookies"]
            if "JWT_ALLOW_LEGACY_TOKENS" not in test_config:
                app.config["JWT_ALLOW_LEGACY_TOKENS"] = True

    if app.config["APP_ENV"] == "production" and not app.config.get("TESTING"):
        configured_values = {
            "SECRET_KEY": (
                test_config.get("SECRET_KEY")
                if test_config and "SECRET_KEY" in test_config
                else configured_secret_key
            ),
            "JWT_SECRET_KEY": (
                test_config.get("JWT_SECRET_KEY")
                if test_config and "JWT_SECRET_KEY" in test_config
                else configured_jwt_secret_key
            ),
        }
        insecure = [
            name
            for name, value in configured_values.items()
            if _is_insecure_secret(value)
        ]
        if insecure:
            joined = ", ".join(insecure)
            raise RuntimeError(
                f"Production startup refused: configure strong values for {joined}."
            )

    os.makedirs(app.instance_path, exist_ok=True)
    db.init_app(app)
    jwt.init_app(app)
    limiter.init_app(app)
    CORS(
        app,
        resources={r"/api/*": {"origins": os.getenv("FRONTEND_URL", "http://localhost:5173")}},
        supports_credentials=True,
    )

    from .models import (  # noqa: F401
        Bookmark,
        CourseCompletion,
        Goal,
        Interaction,
        Preference,
        RecommendationFeedback,
        RecommendationImpression,
        Resource,
        ResourceRating,
        User,
    )
    from .commands import register_recommendation_commands, register_resource_commands
    from .routes.activity import activity_bp
    from .routes.auth import auth_bp
    from .routes.engagement import engagement_bp
    from .routes.goals import goals_bp
    from .routes.preferences import preferences_bp
    from .routes.recommendations import recommendations_bp
    from .routes.resources import resources_bp

    register_resource_commands(app)
    register_recommendation_commands(app)
    app.register_blueprint(activity_bp, url_prefix="/api/activity")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(engagement_bp, url_prefix="/api")
    app.register_blueprint(goals_bp, url_prefix="/api/goals")
    app.register_blueprint(preferences_bp, url_prefix="/api/preferences")
    app.register_blueprint(recommendations_bp, url_prefix="/api/recommendations")
    app.register_blueprint(resources_bp, url_prefix="/api/resources")

    @jwt.token_verification_loader
    def verify_password_version(_jwt_header, jwt_payload):
        try:
            user_id = int(jwt_payload["sub"])
        except (KeyError, TypeError, ValueError):
            return False

        user = db.session.get(User, user_id)
        if user is None:
            return False

        token_version = jwt_payload.get("passwordVersion")
        if token_version is None:
            return bool(app.config["JWT_ALLOW_LEGACY_TOKENS"])
        return token_version == user.auth_fingerprint()

    @jwt.token_verification_failed_loader
    def invalid_password_version(_jwt_header, _jwt_payload):
        return jsonify(message="Your session is no longer valid. Please log in again."), 401

    @app.get("/api/health")
    @limiter.exempt
    def health():
        return jsonify(status="ok")

    @app.errorhandler(413)
    def request_too_large(_error):
        return jsonify(message="Request body is too large."), 413

    @app.errorhandler(429)
    def rate_limit_exceeded(_error):
        return jsonify(message="Too many requests. Please wait and try again."), 429

    @app.errorhandler(404)
    def route_not_found(error):
        if request.path.startswith("/api/"):
            return jsonify(message="API route not found."), 404
        return error

    @app.errorhandler(405)
    def method_not_allowed(error):
        if request.path.startswith("/api/"):
            response = jsonify(message="Method not allowed for this API route.")
            response.headers["Allow"] = ", ".join(error.valid_methods or [])
            return response, 405
        return error

    @app.after_request
    def add_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=()",
        )
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        )
        if request.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        if app.config["APP_ENV"] == "production":
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return response

    with app.app_context():
        db.create_all()
        from .schema import (
            ensure_recommendation_impression_columns,
            ensure_user_profile_columns,
        )

        ensure_user_profile_columns()
        ensure_recommendation_impression_columns()

    return app
