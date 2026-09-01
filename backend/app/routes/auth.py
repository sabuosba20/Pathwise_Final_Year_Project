import hashlib
import os
import re
from datetime import date

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    get_jwt_identity,
    jwt_required,
    set_access_cookies,
    unset_jwt_cookies,
)
from flask_limiter.util import get_remote_address
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db, limiter
from ..models import User
from ..validation import json_object, text_value


auth_bp = Blueprint("auth", __name__)
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Public domain-separation label for itsdangerous, not a credential.
RESET_TOKEN_SALT = "password-reset"  # nosec B105
RESET_TOKEN_MAX_AGE_SECONDS = 30 * 60
MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 128
DUMMY_PASSWORD_HASH = generate_password_hash("invalid-password-placeholder")


def _reset_serializer():
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"])


def _password_fingerprint(password_hash):
    # Changes whenever the password changes, so a reset link naturally stops
    # working once it's been used -- no separate token table required.
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def _password_error(password):
    if not isinstance(password, str):
        return "Password must be text."
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
    if len(password) > MAX_PASSWORD_LENGTH:
        return f"Password must be {MAX_PASSWORD_LENGTH} characters or fewer."
    return None


def _email_rate_key():
    payload = request.get_json(silent=True)
    email = payload.get("email", "") if isinstance(payload, dict) else ""
    normalized = email.strip().lower() if isinstance(email, str) else ""
    digest = hashlib.sha256(normalized.encode()).hexdigest()[:24]
    return f"{get_remote_address()}:{digest}"


def _authenticated_response(user, status_code=200):
    token = create_access_token(
        identity=str(user.id),
        additional_claims={"passwordVersion": user.auth_fingerprint()},
    )
    response = jsonify(user=user.to_dict())
    set_access_cookies(response, token)
    return response, status_code


def _generate_reset_token(user):
    return _reset_serializer().dumps(
        {"userId": user.id, "fingerprint": _password_fingerprint(user.password_hash)},
        salt=RESET_TOKEN_SALT,
    )


def _resolve_reset_token(token):
    """Return the User for a valid, unexpired, unused reset token, or None."""
    try:
        payload = _reset_serializer().loads(
            token,
            salt=RESET_TOKEN_SALT,
            max_age=RESET_TOKEN_MAX_AGE_SECONDS,
        )
    except (BadSignature, SignatureExpired):
        return None

    user = db.session.get(User, payload.get("userId"))
    if user is None or _password_fingerprint(user.password_hash) != payload.get("fingerprint"):
        return None
    return user


def _current_user():
    return db.session.get(User, int(get_jwt_identity()))


def _split_name(name):
    parts = name.strip().split(maxsplit=1)
    return (parts[0] if parts else "", parts[1] if len(parts) > 1 else "")


@auth_bp.post("/register")
@limiter.limit("10 per hour")
def register():
    payload = json_object()
    if payload is None:
        return jsonify(message="Request body must be a JSON object."), 400

    name, error = text_value(payload, "name", maximum=120, required=True)
    if error:
        return jsonify(message=error), 400
    email, error = text_value(payload, "email", maximum=255, required=True)
    if error:
        return jsonify(message=error), 400
    email = email.lower()
    password = payload.get("password", "")

    if not EMAIL_PATTERN.fullmatch(email):
        return jsonify(message="Enter a valid email address."), 400
    if error := _password_error(password):
        return jsonify(message=error), 400
    if User.query.filter_by(email=email).first():
        return jsonify(message="An account with this email already exists."), 409

    first_name, last_name = _split_name(name)
    user = User(name=name, first_name=first_name, last_name=last_name, email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    return _authenticated_response(user, 201)


@auth_bp.post("/login")
@limiter.limit("10 per minute")
@limiter.limit("5 per minute", key_func=_email_rate_key)
def login():
    payload = json_object()
    if payload is None:
        return jsonify(message="Invalid email or password."), 401

    email = payload.get("email", "")
    password = payload.get("password", "")
    if not isinstance(email, str) or not isinstance(password, str):
        return jsonify(message="Invalid email or password."), 401
    if len(email) > 255 or len(password) > MAX_PASSWORD_LENGTH:
        return jsonify(message="Invalid email or password."), 401
    email = email.strip().lower()
    user = User.query.filter_by(email=email).first()

    password_hash = user.password_hash if user else DUMMY_PASSWORD_HASH
    password_matches = check_password_hash(password_hash, password)
    if not user or user.is_seed_user or not password_matches:
        return jsonify(message="Invalid email or password."), 401

    return _authenticated_response(user)


@auth_bp.post("/logout")
@jwt_required()
def logout():
    response = jsonify(message="Logged out.")
    unset_jwt_cookies(response)
    return response


@auth_bp.get("/me")
@jwt_required()
def me():
    user = _current_user()
    if not user:
        return jsonify(message="User not found."), 404
    return jsonify(user=user.to_dict())


@auth_bp.patch("/account")
@jwt_required()
def update_account():
    user = _current_user()
    if not user:
        return jsonify(message="User not found."), 404

    payload = json_object()
    if payload is None:
        return jsonify(message="Request body must be a JSON object."), 400

    first_name, error = text_value(payload, "firstName", maximum=80)
    if error:
        return jsonify(message=error), 400
    last_name, error = text_value(payload, "lastName", maximum=80)
    if error:
        return jsonify(message=error), 400
    if not first_name and not last_name and payload.get("name"):
        legacy_name, error = text_value(payload, "name", maximum=120)
        if error:
            return jsonify(message=error), 400
        first_name, last_name = _split_name(legacy_name)
    email, error = text_value(payload, "email", maximum=255, required=True)
    if error:
        return jsonify(message=error), 400
    email = email.lower()
    date_of_birth_value, error = text_value(payload, "dateOfBirth", maximum=10)
    if error:
        return jsonify(message=error), 400

    if not first_name or not last_name:
        return jsonify(message="Your first and last name are required."), 400
    if not EMAIL_PATTERN.fullmatch(email):
        return jsonify(message="Enter a valid email address."), 400
    parsed_date_of_birth = None
    if date_of_birth_value:
        try:
            parsed_date_of_birth = date.fromisoformat(date_of_birth_value)
        except ValueError:
            return jsonify(message="Enter a valid date of birth."), 400
        if parsed_date_of_birth > date.today():
            return jsonify(message="Your date of birth cannot be in the future."), 400

    email_changed = email != user.email
    if email_changed:
        current_password = payload.get("currentPassword", "")
        if not isinstance(current_password, str) or not user.check_password(current_password):
            return jsonify(message="Enter your current password to change your email."), 400
        if User.query.filter(User.email == email, User.id != user.id).first():
            return jsonify(message="An account with this email already exists."), 409

    user.first_name = first_name
    user.last_name = last_name
    user.name = f"{first_name} {last_name}"
    user.date_of_birth = parsed_date_of_birth
    user.email = email
    db.session.commit()
    return jsonify(message="Account details updated.", user=user.to_dict())


@auth_bp.put("/password")
@jwt_required()
def update_password():
    user = _current_user()
    if not user:
        return jsonify(message="User not found."), 404

    payload = json_object()
    if payload is None:
        return jsonify(message="Request body must be a JSON object."), 400
    current_password = payload.get("currentPassword", "")
    new_password = payload.get("newPassword", "")

    if not isinstance(current_password, str) or not user.check_password(current_password):
        return jsonify(message="Your current password is incorrect."), 400
    if error := _password_error(new_password):
        return jsonify(message=error), 400
    if current_password == new_password:
        return jsonify(message="Choose a new password that is different from your current password."), 400

    user.set_password(new_password)
    db.session.commit()
    response = jsonify(message="Password updated. Please log in again.")
    unset_jwt_cookies(response)
    return response


@auth_bp.delete("/account")
@jwt_required()
def delete_account():
    user = _current_user()
    if not user:
        return jsonify(message="User not found."), 404

    payload = json_object()
    if payload is None:
        return jsonify(message="Request body must be a JSON object."), 400
    if payload.get("confirmation") != "DELETE":
        return jsonify(message='Type "DELETE" to confirm account deletion.'), 400
    current_password = payload.get("currentPassword", "")
    if not isinstance(current_password, str) or not user.check_password(current_password):
        return jsonify(message="Your current password is incorrect."), 400

    db.session.delete(user)
    db.session.commit()
    response = jsonify(message="Account deleted.")
    unset_jwt_cookies(response)
    return response


GENERIC_RESET_MESSAGE = "If an account exists for that email, a password reset link has been sent."


@auth_bp.post("/forgot-password")
@limiter.limit("20 per hour")
@limiter.limit("5 per hour", key_func=_email_rate_key)
def forgot_password():
    payload = json_object()
    email = payload.get("email", "") if payload else ""
    email = email.strip().lower() if isinstance(email, str) else ""
    if len(email) > 255:
        email = ""
    user = User.query.filter_by(email=email).first() if email else None

    if user is not None and not user.is_seed_user:
        token = _generate_reset_token(user)
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        reset_link = f"{frontend_url}/reset-password?token={token}"
        delivery_callback = current_app.config.get("PASSWORD_RESET_DELIVERY_CALLBACK")
        if delivery_callback:
            delivery_callback(user, reset_link)
        else:
            current_app.logger.warning(
                "Password reset requested, but no delivery provider is configured."
            )

    return jsonify(message=GENERIC_RESET_MESSAGE)


@auth_bp.post("/reset-password")
@limiter.limit("10 per hour")
def reset_password():
    payload = json_object()
    if payload is None:
        return jsonify(message="This reset link is invalid or has expired."), 400
    token = payload.get("token", "")
    new_password = payload.get("newPassword", "")

    if not isinstance(token, str) or len(token) > 2048:
        token = None
    user = _resolve_reset_token(token) if token else None
    if user is None:
        return jsonify(message="This reset link is invalid or has expired."), 400
    if error := _password_error(new_password):
        return jsonify(message=error), 400

    user.set_password(new_password)
    db.session.commit()
    response = jsonify(message="Your password has been reset. You can now log in.")
    unset_jwt_cookies(response)
    return response
