import unittest

from app import create_app
from app.extensions import db
from app.models import User
from app.routes.auth import _generate_reset_token


class PasswordResetTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app(
            {
                "TESTING": True,
                "SQLALCHEMY_DATABASE_URI": "sqlite://",
                "JWT_SECRET_KEY": "test-jwt-secret-key-with-enough-length",
                "SECRET_KEY": "test-secret-key-with-enough-length",
            }
        )

        with self.app.app_context():
            db.drop_all()
            db.create_all()

            user = User(name="FYP Tester", email="tester@example.com")
            user.set_password("original-password")
            db.session.add(user)
            db.session.commit()
            self.user_id = user.id

        self.client = self.app.test_client()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def _token_for_current_user(self):
        with self.app.app_context():
            user = db.session.get(User, self.user_id)
            return _generate_reset_token(user)

    def test_forgot_password_returns_generic_message_for_unknown_email(self):
        response = self.client.post(
            "/api/auth/forgot-password", json={"email": "nobody@example.com"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("if an account exists", response.get_json()["message"].lower())

    def test_forgot_password_returns_same_generic_message_for_known_email(self):
        response = self.client.post(
            "/api/auth/forgot-password", json={"email": "tester@example.com"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("if an account exists", response.get_json()["message"].lower())

    def test_reset_password_with_valid_token_changes_password(self):
        token = self._token_for_current_user()
        response = self.client.post(
            "/api/auth/reset-password",
            json={"token": token, "newPassword": "brand-new-password"},
        )
        self.assertEqual(response.status_code, 200)

        with self.app.app_context():
            user = db.session.get(User, self.user_id)
            self.assertTrue(user.check_password("brand-new-password"))
            self.assertFalse(user.check_password("original-password"))

    def test_reset_password_token_cannot_be_reused_after_password_changes(self):
        token = self._token_for_current_user()
        first = self.client.post(
            "/api/auth/reset-password",
            json={"token": token, "newPassword": "brand-new-password"},
        )
        self.assertEqual(first.status_code, 200)

        second = self.client.post(
            "/api/auth/reset-password",
            json={"token": token, "newPassword": "another-password"},
        )
        self.assertEqual(second.status_code, 400)

    def test_reset_password_rejects_invalid_token(self):
        response = self.client.post(
            "/api/auth/reset-password",
            json={"token": "not-a-real-token", "newPassword": "brand-new-password"},
        )
        self.assertEqual(response.status_code, 400)

    def test_reset_password_rejects_short_password(self):
        token = self._token_for_current_user()
        response = self.client.post(
            "/api/auth/reset-password",
            json={"token": token, "newPassword": "short"},
        )
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
