import unittest

from flask_jwt_extended import create_access_token

from app import create_app
from app.extensions import db
from app.models import Preference, User


class PreferencesApiTestCase(unittest.TestCase):
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
            no_prefs_user = User(name="No Prefs", email="noprefs@example.com")
            no_prefs_user.set_password("test-password")
            db.session.add_all([user, no_prefs_user])
            db.session.flush()

            db.session.add(
                Preference(
                    user_id=user.id,
                    field_of_study="Computer Science",
                    skills="Python, SQL",
                    learning_goals="Build stronger data analysis skills",
                )
            )
            db.session.commit()

            self.token = create_access_token(identity=str(user.id))
            self.no_prefs_token = create_access_token(identity=str(no_prefs_user.id))

        self.client = self.app.test_client()
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def test_get_preferences_requires_authentication(self):
        response = self.client.get("/api/preferences")
        self.assertEqual(response.status_code, 401)

    def test_get_preferences_returns_saved_values(self):
        response = self.client.get("/api/preferences", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        preference = response.get_json()["preference"]
        self.assertEqual(preference["fieldOfStudy"], "Computer Science")
        self.assertEqual(preference["skills"], "Python, SQL")
        self.assertEqual(preference["learningGoals"], "Build stronger data analysis skills")

    def test_get_preferences_returns_null_when_unset(self):
        response = self.client.get(
            "/api/preferences",
            headers={"Authorization": f"Bearer {self.no_prefs_token}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.get_json()["preference"])

    def test_put_then_get_round_trips(self):
        put_response = self.client.put(
            "/api/preferences",
            headers={"Authorization": f"Bearer {self.no_prefs_token}"},
            json={"fieldOfStudy": "Psychology", "skills": "Research", "learningGoals": ""},
        )
        self.assertEqual(put_response.status_code, 200)

        get_response = self.client.get(
            "/api/preferences",
            headers={"Authorization": f"Bearer {self.no_prefs_token}"},
        )
        preference = get_response.get_json()["preference"]
        self.assertEqual(preference["fieldOfStudy"], "Psychology")
        self.assertEqual(preference["skills"], "Research")
        self.assertEqual(preference["learningGoals"], "")

    def test_put_rejects_null_required_profile_fields(self):
        response = self.client.put(
            "/api/preferences",
            headers={"Authorization": f"Bearer {self.no_prefs_token}"},
            json={"fieldOfStudy": None, "skills": None, "learningGoals": None},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json()["message"],
            "Field of study and skills are required.",
        )


if __name__ == "__main__":
    unittest.main()
