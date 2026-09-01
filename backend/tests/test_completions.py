import unittest

from flask_jwt_extended import create_access_token

from app import create_app
from app.extensions import db
from app.models import CourseCompletion, Resource, User


class CourseCompletionApiTestCase(unittest.TestCase):
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
            first_user = User(name="First Learner", email="first@example.com")
            first_user.set_password("test-password")
            second_user = User(name="Second Learner", email="second@example.com")
            second_user.set_password("test-password")
            db.session.add_all([first_user, second_user])
            db.session.flush()

            first_resource = Resource(
                title="Python Foundations",
                provider="Coursera",
                url="https://example.com/python-foundations",
                description="Learn Python.",
                category="Data Science",
                difficulty="Beginner",
                rating=4.7,
                resource_type="Course",
                skills="Python",
                field_tags="Computer Science",
                search_text="python foundations computer science",
            )
            second_resource = Resource(
                title="Data Visualisation",
                provider="edX",
                url="https://example.com/data-visualisation",
                description="Communicate with data.",
                category="Data Science",
                difficulty="Intermediate",
                rating=4.5,
                resource_type="Course",
                skills="Visualisation",
                field_tags="Data Science",
                search_text="data visualisation charts",
            )
            db.session.add_all([first_resource, second_resource])
            db.session.commit()

            self.user_id = first_user.id
            self.other_user_id = second_user.id
            self.resource_id = first_resource.id
            self.other_resource_id = second_resource.id
            self.token = create_access_token(identity=str(first_user.id))
            self.other_token = create_access_token(identity=str(second_user.id))

        self.client = self.app.test_client()
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.other_headers = {
            "Authorization": f"Bearer {self.other_token}"
        }

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def test_completion_requires_authentication_and_existing_resource(self):
        self.assertEqual(
            self.client.post(
                f"/api/resources/{self.resource_id}/completion"
            ).status_code,
            401,
        )
        self.assertEqual(
            self.client.post(
                "/api/resources/9999/completion",
                headers=self.headers,
            ).status_code,
            404,
        )

    def test_completion_is_idempotent_and_visible_on_resource(self):
        created = self.client.post(
            f"/api/resources/{self.resource_id}/completion",
            headers=self.headers,
        )
        repeated = self.client.post(
            f"/api/resources/{self.resource_id}/completion",
            headers=self.headers,
        )

        self.assertEqual(created.status_code, 201)
        self.assertEqual(repeated.status_code, 200)
        self.assertTrue(created.get_json()["completion"]["isCompleted"])
        self.assertIsNotNone(
            created.get_json()["completion"]["completedAt"]
        )
        with self.app.app_context():
            self.assertEqual(CourseCompletion.query.count(), 1)

        detail = self.client.get(
            f"/api/resources/{self.resource_id}",
            headers=self.headers,
        ).get_json()["resource"]
        self.assertTrue(detail["isCompleted"])
        self.assertIsNotNone(detail["completedAt"])

    def test_completion_is_private_per_user_and_can_be_undone(self):
        self.client.post(
            f"/api/resources/{self.resource_id}/completion",
            headers=self.headers,
        )

        other_detail = self.client.get(
            f"/api/resources/{self.resource_id}",
            headers=self.other_headers,
        ).get_json()["resource"]
        self.assertFalse(other_detail["isCompleted"])

        removed = self.client.delete(
            f"/api/resources/{self.resource_id}/completion",
            headers=self.headers,
        )
        repeated = self.client.delete(
            f"/api/resources/{self.resource_id}/completion",
            headers=self.headers,
        )
        self.assertEqual(removed.status_code, 200)
        self.assertEqual(repeated.status_code, 200)
        self.assertFalse(removed.get_json()["completion"]["isCompleted"])
        with self.app.app_context():
            self.assertEqual(CourseCompletion.query.count(), 0)

    def test_completed_catalogue_filter_returns_only_current_users_courses(self):
        self.client.post(
            f"/api/resources/{self.resource_id}/completion",
            headers=self.headers,
        )
        self.client.post(
            f"/api/resources/{self.other_resource_id}/completion",
            headers=self.other_headers,
        )

        response = self.client.get(
            "/api/resources?completed=true&sort=completed",
            headers=self.headers,
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["pagination"]["total"], 1)
        self.assertEqual(payload["resources"][0]["id"], self.resource_id)
        self.assertTrue(payload["resources"][0]["isCompleted"])

        invalid = self.client.get(
            "/api/resources?sort=completed",
            headers=self.headers,
        )
        self.assertEqual(invalid.status_code, 400)


if __name__ == "__main__":
    unittest.main()
