import unittest

from flask_jwt_extended import create_access_token

from app import create_app
from app.extensions import db
from app.models import Resource, ResourceRating, User


class ResourceRatingApiTestCase(unittest.TestCase):
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
            resource = Resource(
                title="Practical Data Analysis",
                provider="Coursera",
                url="https://example.com/practical-data-analysis",
                description="Build practical data analysis skills.",
                category="Data Science",
                difficulty="Beginner",
                rating=4.7,
                resource_type="Course",
                skills="Python, Data Analysis",
                field_tags="Data Science",
                search_text="practical data analysis python",
            )
            db.session.add_all([first_user, second_user, resource])
            db.session.commit()

            self.first_user_id = first_user.id
            self.resource_id = resource.id
            self.first_token = create_access_token(identity=str(first_user.id))
            self.second_token = create_access_token(identity=str(second_user.id))

        self.client = self.app.test_client()
        self.first_headers = {"Authorization": f"Bearer {self.first_token}"}
        self.second_headers = {"Authorization": f"Bearer {self.second_token}"}

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def test_rating_endpoints_require_authentication(self):
        self.assertEqual(
            self.client.put(
                f"/api/resources/{self.resource_id}/rating",
                json={"rating": 5},
            ).status_code,
            401,
        )
        self.assertEqual(
            self.client.delete(
                f"/api/resources/{self.resource_id}/rating",
            ).status_code,
            401,
        )

    def test_resource_detail_returns_personal_and_pathwise_rating_summary(self):
        response = self.client.get(
            f"/api/resources/{self.resource_id}",
            headers=self.first_headers,
        )
        resource = response.get_json()["resource"]

        self.assertIsNone(resource["userRating"])
        self.assertIsNone(resource["pathwiseRating"])
        self.assertEqual(resource["pathwiseRatingCount"], 0)
        self.assertEqual(resource["rating"], 4.7)

    def test_users_can_create_and_update_one_rating_per_course(self):
        first_response = self.client.put(
            f"/api/resources/{self.resource_id}/rating",
            headers=self.first_headers,
            json={"rating": 5},
        )
        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(
            first_response.get_json()["rating"],
            {
                "userRating": 5,
                "pathwiseRating": 5.0,
                "pathwiseRatingCount": 1,
            },
        )

        second_response = self.client.put(
            f"/api/resources/{self.resource_id}/rating",
            headers=self.second_headers,
            json={"rating": 3},
        )
        self.assertEqual(second_response.status_code, 201)
        self.assertEqual(second_response.get_json()["rating"]["pathwiseRating"], 4.0)
        self.assertEqual(second_response.get_json()["rating"]["pathwiseRatingCount"], 2)

        update_response = self.client.put(
            f"/api/resources/{self.resource_id}/rating",
            headers=self.first_headers,
            json={"rating": 4},
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.get_json()["rating"]["userRating"], 4)
        self.assertEqual(update_response.get_json()["rating"]["pathwiseRating"], 3.5)

        with self.app.app_context():
            self.assertEqual(
                ResourceRating.query.filter_by(
                    user_id=self.first_user_id,
                    resource_id=self.resource_id,
                ).count(),
                1,
            )

    def test_rating_validation_and_missing_resources_are_rejected(self):
        for invalid_rating in (None, True, 0, 6, 4.5, "5"):
            response = self.client.put(
                f"/api/resources/{self.resource_id}/rating",
                headers=self.first_headers,
                json={"rating": invalid_rating},
            )
            self.assertEqual(response.status_code, 400)

        missing = self.client.put(
            "/api/resources/99999/rating",
            headers=self.first_headers,
            json={"rating": 5},
        )
        self.assertEqual(missing.status_code, 404)

    def test_user_can_remove_rating_without_affecting_other_learners(self):
        self.client.put(
            f"/api/resources/{self.resource_id}/rating",
            headers=self.first_headers,
            json={"rating": 5},
        )
        self.client.put(
            f"/api/resources/{self.resource_id}/rating",
            headers=self.second_headers,
            json={"rating": 3},
        )

        response = self.client.delete(
            f"/api/resources/{self.resource_id}/rating",
            headers=self.first_headers,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["rating"],
            {
                "userRating": None,
                "pathwiseRating": 3.0,
                "pathwiseRatingCount": 1,
            },
        )

        repeated = self.client.delete(
            f"/api/resources/{self.resource_id}/rating",
            headers=self.first_headers,
        )
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(repeated.get_json()["rating"]["pathwiseRatingCount"], 1)


if __name__ == "__main__":
    unittest.main()
