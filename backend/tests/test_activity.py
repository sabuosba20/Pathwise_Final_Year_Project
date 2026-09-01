import unittest

from flask_jwt_extended import create_access_token

from app import create_app
from app.extensions import db
from app.models import Bookmark, CourseCompletion, Interaction, Resource, User


class ActivityApiTestCase(unittest.TestCase):
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
            db.session.add(user)
            db.session.flush()

            saved_resource = Resource(
                title="Research Methods",
                provider="FutureLearn",
                url="https://example.com/research-methods",
                description="Plan and evaluate academic research.",
                category="Social Sciences",
                difficulty="Beginner",
                resource_type="Course",
                skills="Research, Evaluation",
                field_tags="Social Sciences, Business",
                search_text="research methods evaluation",
            )
            clicked_resource = Resource(
                title="Financial Planning",
                provider="Coursera",
                url="https://example.com/financial-planning",
                description="Learn practical financial planning.",
                category="Business & Finance",
                difficulty="Intermediate",
                resource_type="Course",
                skills="Finance, Planning",
                field_tags="Business, Finance",
                search_text="financial planning business",
            )
            viewed_resource = Resource(
                title="Intro to Statistics",
                provider="edX",
                url="https://example.com/intro-statistics",
                description="Foundations of statistical reasoning.",
                category="Data Science",
                difficulty="Beginner",
                resource_type="Course",
                skills="Statistics",
                field_tags="Data Science",
                search_text="statistics data",
            )
            db.session.add_all([saved_resource, clicked_resource, viewed_resource])
            db.session.flush()

            db.session.add(Bookmark(user_id=user.id, resource_id=saved_resource.id))
            db.session.add(Interaction(user_id=user.id, resource_id=saved_resource.id, interaction_type="view"))
            db.session.add(Interaction(user_id=user.id, resource_id=clicked_resource.id, interaction_type="view"))
            db.session.add(
                Interaction(user_id=user.id, resource_id=clicked_resource.id, interaction_type="outbound_click")
            )
            db.session.add(Interaction(user_id=user.id, resource_id=viewed_resource.id, interaction_type="view"))
            db.session.add(Interaction(user_id=user.id, resource_id=viewed_resource.id, interaction_type="view"))
            db.session.add(
                CourseCompletion(
                    user_id=user.id,
                    resource_id=clicked_resource.id,
                )
            )
            db.session.commit()

            self.user_id = user.id
            self.saved_resource_id = saved_resource.id
            self.clicked_resource_id = clicked_resource.id
            self.viewed_resource_id = viewed_resource.id
            self.token = create_access_token(identity=str(user.id))

        self.client = self.app.test_client()
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def test_activity_requires_authentication(self):
        response = self.client.get("/api/activity")
        self.assertEqual(response.status_code, 401)

    def test_activity_groups_signals_per_resource_with_strongest_signal(self):
        response = self.client.get("/api/activity", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        body = response.get_json()

        self.assertEqual(body["pagination"]["total"], 3)
        self.assertEqual(body["stats"]["interactionCount"], 3)

        by_id = {entry["resource"]["id"]: entry for entry in body["activity"]}
        self.assertEqual(by_id[self.saved_resource_id]["strongestSignal"], "saved")
        self.assertTrue(by_id[self.saved_resource_id]["resource"]["isBookmarked"])
        self.assertEqual(by_id[self.clicked_resource_id]["strongestSignal"], "completed")
        self.assertTrue(by_id[self.clicked_resource_id]["resource"]["isCompleted"])
        self.assertIsNotNone(by_id[self.clicked_resource_id]["completedAt"])
        self.assertEqual(by_id[self.clicked_resource_id]["outboundClickCount"], 1)
        self.assertEqual(by_id[self.viewed_resource_id]["strongestSignal"], "viewed")
        self.assertEqual(by_id[self.viewed_resource_id]["viewCount"], 2)

    def test_activity_filters_by_type(self):
        saved_only = self.client.get("/api/activity?type=saved", headers=self.headers).get_json()
        self.assertEqual(saved_only["pagination"]["total"], 1)
        self.assertEqual(saved_only["activity"][0]["resource"]["id"], self.saved_resource_id)

        viewed_only = self.client.get("/api/activity?type=viewed", headers=self.headers).get_json()
        self.assertEqual(viewed_only["pagination"]["total"], 3)
        self.assertEqual(
            {entry["resource"]["id"] for entry in viewed_only["activity"]},
            {self.saved_resource_id, self.clicked_resource_id, self.viewed_resource_id},
        )

        clicked_only = self.client.get("/api/activity?type=clicked", headers=self.headers).get_json()
        self.assertEqual(clicked_only["pagination"]["total"], 1)
        self.assertEqual(clicked_only["activity"][0]["resource"]["id"], self.clicked_resource_id)

        completed_only = self.client.get(
            "/api/activity?type=completed",
            headers=self.headers,
        ).get_json()
        self.assertEqual(completed_only["pagination"]["total"], 1)
        self.assertEqual(
            completed_only["activity"][0]["resource"]["id"],
            self.clicked_resource_id,
        )

    def test_activity_rejects_invalid_query_parameters(self):
        invalid_type = self.client.get("/api/activity?type=bogus", headers=self.headers)
        self.assertEqual(invalid_type.status_code, 400)

        invalid_page = self.client.get("/api/activity?page=0", headers=self.headers)
        self.assertEqual(invalid_page.status_code, 400)

    def test_activity_paginates_results(self):
        response = self.client.get("/api/activity?per_page=2&page=1", headers=self.headers).get_json()
        self.assertEqual(len(response["activity"]), 2)
        self.assertEqual(response["pagination"]["pages"], 2)
        self.assertTrue(response["pagination"]["hasNext"])

        second_page = self.client.get("/api/activity?per_page=2&page=2", headers=self.headers).get_json()
        self.assertEqual(len(second_page["activity"]), 1)
        self.assertFalse(second_page["pagination"]["hasNext"])


if __name__ == "__main__":
    unittest.main()
