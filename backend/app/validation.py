from flask import request


def json_object():
    """Return a JSON object body, or None for missing/non-object JSON."""
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else None


def text_value(payload, key, *, maximum, required=False):
    """Validate and normalize one bounded text field.

    Returns ``(value, None)`` on success and ``(None, message)`` on failure.
    Optional missing values normalize to an empty string.
    """
    value = payload.get(key, "")
    if value is None and not required:
        value = ""
    if not isinstance(value, str):
        return None, f"{key} must be text."

    value = value.strip()
    if required and not value:
        return None, f"{key} is required."
    if len(value) > maximum:
        return None, f"{key} must be {maximum} characters or fewer."
    return value, None
