import os
import unittest
from unittest.mock import patch

from app import create_app
from app.extensions import db, limiter
from app.models import User


class SecurityControlsTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app(
            {
                "TESTING": True,
                "SQLALCHEMY_DATABASE_URI": "sqlite://",
                "SECRET_KEY": "test-secret-key-with-enough-length",
                "JWT_SECRET_KEY": "test-jwt-secret-key-with-enough-length",
                "JWT_TOKEN_LOCATION": ["cookies"],
                "JWT_ALLOW_LEGACY_TOKENS": False,
                "RATELIMIT_ENABLED": False,
            }
        )
        with self.app.app_context():
            db.drop_all()
            db.create_all()
        self.client = self.app.test_client()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def _register(self, email="security@example.com"):
        return self.client.post(
            "/api/auth/register",
            json={
                "name": "Security Tester",
                "email": email,
                "password": "a-secure-test-password",
            },
        )

    def _csrf_header(self):
        cookie = self.client.get_cookie("csrf_access_token")
        self.assertIsNotNone(cookie)
        return {"X-CSRF-TOKEN": cookie.value}

    def test_authentication_uses_http_only_cookie_not_response_token(self):
        response = self._register()

        self.assertEqual(response.status_code, 201)
        self.assertNotIn("accessToken", response.get_json())
        access_cookie = next(
            value
            for value in response.headers.getlist("Set-Cookie")
            if value.startswith("access_token_cookie=")
        )
        self.assertIn("HttpOnly", access_cookie)
        self.assertIn("SameSite=Strict", access_cookie)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 200)

    def test_cookie_authenticated_mutations_require_csrf_token(self):
        self._register()
        payload = {
            "fieldOfStudy": "Computer Science",
            "skills": "Python",
            "learningGoals": "Security engineering",
        }

        missing_csrf = self.client.put("/api/preferences", json=payload)
        valid_csrf = self.client.put(
            "/api/preferences",
            headers=self._csrf_header(),
            json=payload,
        )

        self.assertEqual(missing_csrf.status_code, 401)
        self.assertEqual(valid_csrf.status_code, 200)

    def test_logout_clears_session_cookie(self):
        self._register()

        response = self.client.post("/api/auth/logout", headers=self._csrf_header())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)

    def test_password_change_invalidates_previously_issued_token(self):
        self._register()
        old_access_token = self.client.get_cookie("access_token_cookie").value
        old_csrf_token = self.client.get_cookie("csrf_access_token").value

        changed = self.client.put(
            "/api/auth/password",
            headers={"X-CSRF-TOKEN": old_csrf_token},
            json={
                "currentPassword": "a-secure-test-password",
                "newPassword": "a-different-secure-password",
            },
        )
        self.assertEqual(changed.status_code, 200)

        replay_client = self.app.test_client()
        replay_client.set_cookie("access_token_cookie", old_access_token)
        self.assertEqual(replay_client.get("/api/auth/me").status_code, 401)

    def test_seed_users_cannot_log_in(self):
        with self.app.app_context():
            user = User(
                name="Synthetic Student",
                email="seed@example.com",
                is_seed_user=True,
            )
            user.set_password("a-secure-seed-password")
            db.session.add(user)
            db.session.commit()

        response = self.client.post(
            "/api/auth/login",
            json={"email": "seed@example.com", "password": "a-secure-seed-password"},
        )
        self.assertEqual(response.status_code, 401)

    def test_api_responses_include_security_and_no_store_headers(self):
        response = self.client.get("/api/health")

        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")
        self.assertEqual(response.headers["Referrer-Policy"], "no-referrer")
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertIn("default-src 'none'", response.headers["Content-Security-Policy"])

    def test_unknown_api_routes_and_wrong_methods_return_json_errors(self):
        missing = self.client.get("/api/not-a-real-route")
        wrong_method = self.client.post("/api/health")

        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.is_json, True)
        self.assertEqual(missing.get_json()["message"], "API route not found.")
        self.assertEqual(wrong_method.status_code, 405)
        self.assertEqual(wrong_method.is_json, True)
        self.assertIn("GET", wrong_method.headers["Allow"])

    def test_non_object_json_is_rejected_without_server_error(self):
        self._register()
        response = self.client.put(
            "/api/preferences",
            headers=self._csrf_header(),
            json=["not", "an", "object"],
        )
        self.assertEqual(response.status_code, 400)

    def test_production_rejects_placeholder_secrets(self):
        with patch.dict(os.environ, {"APP_ENV": "production"}, clear=False):
            with self.assertRaises(RuntimeError):
                create_app(
                    {
                        "TESTING": False,
                        "APP_ENV": "production",
                        "SQLALCHEMY_DATABASE_URI": "sqlite://",
                        "SECRET_KEY": "replace-this-secret",
                        "JWT_SECRET_KEY": "replace-this-jwt-secret",
                    }
                )

    def test_development_without_env_uses_random_fallback_secrets(self):
        with patch.dict(os.environ, {"SECRET_KEY": "", "JWT_SECRET_KEY": ""}, clear=False):
            app = create_app(
                {
                    "TESTING": True,
                    "SQLALCHEMY_DATABASE_URI": "sqlite://",
                }
            )

        self.assertGreaterEqual(len(app.config["SECRET_KEY"]), 32)
        self.assertGreaterEqual(len(app.config["JWT_SECRET_KEY"]), 32)
        self.assertNotEqual(app.config["SECRET_KEY"], app.config["JWT_SECRET_KEY"])


class AuthenticationRateLimitTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app(
            {
                "TESTING": True,
                "SQLALCHEMY_DATABASE_URI": "sqlite://",
                "SECRET_KEY": "test-secret-key-with-enough-length",
                "JWT_SECRET_KEY": "test-jwt-secret-key-with-enough-length",
                "RATELIMIT_ENABLED": True,
                "RATELIMIT_STORAGE_URI": "memory://",
            }
        )
        self.client = self.app.test_client()
        limiter.reset()

    def test_repeated_login_attempts_are_throttled(self):
        responses = [
            self.client.post(
                "/api/auth/login",
                json={"email": "rate-limit@example.com", "password": "wrong-password"},
            )
            for _ in range(6)
        ]

        self.assertTrue(all(response.status_code == 401 for response in responses[:5]))
        self.assertEqual(responses[5].status_code, 429)


if __name__ == "__main__":
    unittest.main()
