import unittest

from flask_jwt_extended import create_access_token

from app import create_app
from app.extensions import db
from app.models import Preference, User


class AccountApiTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app(
            {
                "TESTING": True,
                "SQLALCHEMY_DATABASE_URI": "sqlite://",
                "JWT_SECRET_KEY": "test-jwt-secret-key-with-enough-length",
            }
        )

        with self.app.app_context():
            db.drop_all()
            db.create_all()

            user = User(name="FYP Tester", email="tester@example.com")
            user.set_password("test-password")
            other_user = User(name="Other User", email="other@example.com")
            other_user.set_password("other-password")
            db.session.add_all([user, other_user])
            db.session.flush()
            db.session.add(
                Preference(
                    user_id=user.id,
                    field_of_study="Computer Science",
                    skills="Python",
                    learning_goals="Learn machine learning",
                )
            )
            db.session.commit()

            self.user_id = user.id
            self.token = create_access_token(identity=str(user.id))

        self.client = self.app.test_client()
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def test_account_endpoints_require_authentication(self):
        self.assertEqual(self.client.patch("/api/auth/account", json={}).status_code, 401)
        self.assertEqual(self.client.put("/api/auth/password", json={}).status_code, 401)
        self.assertEqual(self.client.delete("/api/auth/account", json={}).status_code, 401)

    def test_update_account_changes_name_without_password(self):
        response = self.client.patch(
            "/api/auth/account",
            headers=self.headers,
            json={
                "firstName": "Updated",
                "lastName": "Student",
                "dateOfBirth": "2001-04-18",
                "email": "tester@example.com",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["user"]["name"], "Updated Student")
        self.assertEqual(response.get_json()["user"]["firstName"], "Updated")
        self.assertEqual(response.get_json()["user"]["lastName"], "Student")
        self.assertEqual(response.get_json()["user"]["dateOfBirth"], "2001-04-18")

    def test_update_account_requires_password_for_email_change(self):
        response = self.client.patch(
            "/api/auth/account",
            headers=self.headers,
            json={"firstName": "FYP", "lastName": "Tester", "email": "new@example.com"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("current password", response.get_json()["message"].lower())

    def test_update_account_rejects_invalid_or_existing_email(self):
        invalid_response = self.client.patch(
            "/api/auth/account",
            headers=self.headers,
            json={"firstName": "FYP", "lastName": "Tester", "email": "not-an-email"},
        )
        existing_response = self.client.patch(
            "/api/auth/account",
            headers=self.headers,
            json={
                "firstName": "FYP",
                "lastName": "Tester",
                "email": "other@example.com",
                "currentPassword": "test-password",
            },
        )

        self.assertEqual(invalid_response.status_code, 400)
        self.assertEqual(existing_response.status_code, 409)

    def test_update_account_changes_email_with_current_password(self):
        response = self.client.patch(
            "/api/auth/account",
            headers=self.headers,
            json={
                "firstName": "FYP",
                "lastName": "Tester",
                "email": "new@example.com",
                "currentPassword": "test-password",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["user"]["email"], "new@example.com")

    def test_update_account_rejects_missing_name_and_future_birth_date(self):
        missing_name_response = self.client.patch(
            "/api/auth/account",
            headers=self.headers,
            json={"firstName": "FYP", "lastName": "", "email": "tester@example.com"},
        )
        future_date_response = self.client.patch(
            "/api/auth/account",
            headers=self.headers,
            json={
                "firstName": "FYP",
                "lastName": "Tester",
                "dateOfBirth": "2999-01-01",
                "email": "tester@example.com",
            },
        )

        self.assertEqual(missing_name_response.status_code, 400)
        self.assertEqual(future_date_response.status_code, 400)

    def test_update_password_validates_and_changes_password(self):
        incorrect_response = self.client.put(
            "/api/auth/password",
            headers=self.headers,
            json={"currentPassword": "wrong-password", "newPassword": "new-password"},
        )
        short_response = self.client.put(
            "/api/auth/password",
            headers=self.headers,
            json={"currentPassword": "test-password", "newPassword": "short"},
        )
        success_response = self.client.put(
            "/api/auth/password",
            headers=self.headers,
            json={"currentPassword": "test-password", "newPassword": "new-password"},
        )

        self.assertEqual(incorrect_response.status_code, 400)
        self.assertEqual(short_response.status_code, 400)
        self.assertEqual(success_response.status_code, 200)
        with self.app.app_context():
            user = db.session.get(User, self.user_id)
            self.assertTrue(user.check_password("new-password"))

    def test_delete_account_requires_confirmation_and_password(self):
        confirmation_response = self.client.delete(
            "/api/auth/account",
            headers=self.headers,
            json={"currentPassword": "test-password", "confirmation": "delete"},
        )
        password_response = self.client.delete(
            "/api/auth/account",
            headers=self.headers,
            json={"currentPassword": "wrong-password", "confirmation": "DELETE"},
        )

        self.assertEqual(confirmation_response.status_code, 400)
        self.assertEqual(password_response.status_code, 400)

    def test_delete_account_removes_user_and_related_data(self):
        response = self.client.delete(
            "/api/auth/account",
            headers=self.headers,
            json={"currentPassword": "test-password", "confirmation": "DELETE"},
        )

        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            self.assertIsNone(db.session.get(User, self.user_id))
            self.assertIsNone(Preference.query.filter_by(user_id=self.user_id).one_or_none())


if __name__ == "__main__":
    unittest.main()
