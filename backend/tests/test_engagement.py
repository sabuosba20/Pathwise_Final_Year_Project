import unittest

from flask_jwt_extended import create_access_token

from app import create_app
from app.extensions import db
from app.models import Bookmark, Interaction, Resource, User


class EngagementApiTestCase(unittest.TestCase):
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
            other_user = User(name="Another Student", email="other@example.com")
            other_user.set_password("test-password")
            db.session.add_all([user, other_user])
            db.session.flush()

            first_resource = Resource(
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
            second_resource = Resource(
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
            db.session.add_all([first_resource, second_resource])
            db.session.flush()

            self.user_id = user.id
            self.resource_id = first_resource.id
            self.second_resource_id = second_resource.id
            self.token = create_access_token(identity=str(user.id))
            self.other_token = create_access_token(identity=str(other_user.id))
            db.session.commit()

        self.client = self.app.test_client()
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def test_engagement_endpoints_require_authentication(self):
        self.assertEqual(
            self.client.post(f"/api/bookmarks/{self.resource_id}").status_code,
            401,
        )
        self.assertEqual(
            self.client.post(
                "/api/interactions",
                json={"resourceId": self.resource_id, "type": "view"},
            ).status_code,
            401,
        )

    def test_bookmarks_are_idempotent_and_visible_in_catalogue(self):
        created = self.client.post(
            f"/api/bookmarks/{self.resource_id}", headers=self.headers
        )
        self.assertEqual(created.status_code, 201)
        self.assertTrue(created.get_json()["isBookmarked"])

        duplicate = self.client.post(
            f"/api/bookmarks/{self.resource_id}", headers=self.headers
        )
        self.assertEqual(duplicate.status_code, 200)
        with self.app.app_context():
            self.assertEqual(Bookmark.query.count(), 1)

        catalogue = self.client.get("/api/resources", headers=self.headers).get_json()
        saved_resource = next(
            resource
            for resource in catalogue["resources"]
            if resource["id"] == self.resource_id
        )
        self.assertTrue(saved_resource["isBookmarked"])

        saved_only = self.client.get(
            "/api/resources?bookmarked=true", headers=self.headers
        ).get_json()
        self.assertEqual(saved_only["pagination"]["total"], 1)
        self.assertEqual(saved_only["resources"][0]["id"], self.resource_id)

        other_catalogue = self.client.get(
            "/api/resources?bookmarked=true",
            headers={"Authorization": f"Bearer {self.other_token}"},
        ).get_json()
        self.assertEqual(other_catalogue["pagination"]["total"], 0)

        removed = self.client.delete(
            f"/api/bookmarks/{self.resource_id}", headers=self.headers
        )
        self.assertEqual(removed.status_code, 200)
        self.assertFalse(removed.get_json()["isBookmarked"])
        repeated_removal = self.client.delete(
            f"/api/bookmarks/{self.resource_id}", headers=self.headers
        )
        self.assertEqual(repeated_removal.status_code, 200)

    def test_bookmarks_validate_resource_and_filter_parameter(self):
        missing = self.client.post("/api/bookmarks/99999", headers=self.headers)
        self.assertEqual(missing.status_code, 404)

        invalid_filter = self.client.get(
            "/api/resources?bookmarked=yes", headers=self.headers
        )
        self.assertEqual(invalid_filter.status_code, 400)

    def test_interactions_are_validated_and_recorded_as_events(self):
        for interaction_type in ("view", "outbound_click"):
            response = self.client.post(
                "/api/interactions",
                headers=self.headers,
                json={"resourceId": self.resource_id, "type": interaction_type},
            )
            self.assertEqual(response.status_code, 201)
            self.assertEqual(response.get_json()["interaction"]["type"], interaction_type)

        with self.app.app_context():
            interactions = Interaction.query.order_by(Interaction.id).all()
            self.assertEqual(len(interactions), 2)
            self.assertEqual({item.interaction_type for item in interactions}, {"view", "outbound_click"})
            self.assertTrue(all(item.user_id == self.user_id for item in interactions))

        invalid_type = self.client.post(
            "/api/interactions",
            headers=self.headers,
            json={"resourceId": self.resource_id, "type": "like"},
        )
        self.assertEqual(invalid_type.status_code, 400)

        invalid_resource_id = self.client.post(
            "/api/interactions",
            headers=self.headers,
            json={"resourceId": "1", "type": "view"},
        )
        self.assertEqual(invalid_resource_id.status_code, 400)

        missing_resource = self.client.post(
            "/api/interactions",
            headers=self.headers,
            json={"resourceId": 99999, "type": "view"},
        )
        self.assertEqual(missing_resource.status_code, 404)


if __name__ == "__main__":
    unittest.main()
