import unittest

from flask_jwt_extended import create_access_token

from app import create_app
from app.extensions import db
from app.models import Preference, RecommendationFeedback, RecommendationImpression, Resource, User
from app.services import (
    ALGORITHM_VERSION,
    FALLBACK_ALGORITHM_VERSION,
    distinct_interaction_count,
    invalidate_cache,
)


def _make_resource(index, category, skills, field_tags, search_text):
    return Resource(
        title=f"Resource {index}",
        provider="Coursera",
        url=f"https://example.com/resource-{index}",
        description=f"Description for resource {index}.",
        category=category,
        difficulty="Beginner",
        rating=4.5,
        resource_type="Course",
        skills=skills,
        field_tags=field_tags,
        search_text=search_text,
    )


class ImpressionTrackingTestCase(unittest.TestCase):
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
            invalidate_cache()

            self.matching_resource = _make_resource(
                1,
                "Data Science",
                "Python, Machine Learning",
                "Data Science, Computer Science",
                "python data science machine learning statistics programming",
            )
            self.other_resource = _make_resource(
                2,
                "Data Science",
                "Python, Data Analysis",
                "Data Science, Computer Science",
                "python data analysis visualization programming statistics",
            )
            db.session.add_all([self.matching_resource, self.other_resource])
            db.session.flush()

            self.user = User(name="FYP Tester", email="tester@example.com")
            self.user.set_password("test-password")
            db.session.add(self.user)
            db.session.flush()
            db.session.add(
                Preference(
                    user_id=self.user.id,
                    field_of_study="Data Science",
                    skills="Python, Machine Learning",
                    learning_goals="Build stronger data analysis skills",
                )
            )

            self.no_preference_user = User(name="No Preference", email="noprefs@example.com")
            self.no_preference_user.set_password("test-password")
            db.session.add(self.no_preference_user)
            db.session.commit()

            self.matching_resource_id = self.matching_resource.id
            self.other_resource_id = self.other_resource.id
            self.user_id = self.user.id
            self.no_preference_user_id = self.no_preference_user.id
            self.token = create_access_token(identity=str(self.user.id))
            self.no_preference_token = create_access_token(identity=str(self.no_preference_user.id))

        self.client = self.app.test_client()
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
        invalidate_cache()

    def test_fetching_recommendations_logs_one_impression_per_slot_with_rank(self):
        response = self.client.get("/api/recommendations?limit=2", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        returned_ids = [item["resource"]["id"] for item in response.get_json()["recommendations"]]

        with self.app.app_context():
            impressions = (
                RecommendationImpression.query
                .filter_by(user_id=self.user_id)
                .order_by(RecommendationImpression.rank)
                .all()
            )
            self.assertEqual([impression.resource_id for impression in impressions], returned_ids)
            self.assertEqual([impression.rank for impression in impressions], [1, 2])
            self.assertTrue(all(impression.algorithm_version == ALGORITHM_VERSION for impression in impressions))
            self.assertTrue(all(impression.reason for impression in impressions))
            self.assertTrue(all(impression.opened_at is None for impression in impressions))

    def test_fallback_recommendations_are_logged_with_fallback_algorithm_version(self):
        response = self.client.get(
            "/api/recommendations",
            headers={"Authorization": f"Bearer {self.no_preference_token}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.get_json()["personalized"])

        with self.app.app_context():
            impressions = RecommendationImpression.query.filter_by(user_id=self.no_preference_user_id).all()
            self.assertTrue(impressions)
            self.assertTrue(
                all(impression.algorithm_version == FALLBACK_ALGORITHM_VERSION for impression in impressions)
            )

    def test_bookmarking_attributes_saved_outcome_to_latest_unresolved_impression(self):
        self.client.get("/api/recommendations", headers=self.headers)

        with self.app.app_context():
            first_impression_id = (
                RecommendationImpression.query
                .filter_by(user_id=self.user_id, resource_id=self.matching_resource_id)
                .first()
                .id
            )

        # Shown again in a second call -- outcome should attribute to this later impression.
        self.client.get("/api/recommendations", headers=self.headers)

        response = self.client.post(f"/api/bookmarks/{self.matching_resource_id}", headers=self.headers)
        self.assertEqual(response.status_code, 201)

        with self.app.app_context():
            impressions = (
                RecommendationImpression.query
                .filter_by(user_id=self.user_id, resource_id=self.matching_resource_id)
                .order_by(RecommendationImpression.id)
                .all()
            )
            self.assertGreaterEqual(len(impressions), 2)
            first = next(item for item in impressions if item.id == first_impression_id)
            latest = impressions[-1]
            self.assertIsNone(first.saved_at)
            self.assertIsNotNone(latest.saved_at)

    def test_outbound_click_attributes_opened_outcome_but_view_does_not(self):
        self.client.get("/api/recommendations", headers=self.headers)

        view_response = self.client.post(
            "/api/interactions",
            headers=self.headers,
            json={"resourceId": self.matching_resource_id, "type": "view"},
        )
        self.assertEqual(view_response.status_code, 201)
        with self.app.app_context():
            impression = RecommendationImpression.query.filter_by(
                user_id=self.user_id, resource_id=self.matching_resource_id
            ).first()
            self.assertIsNone(impression.opened_at)

        click_response = self.client.post(
            "/api/interactions",
            headers=self.headers,
            json={"resourceId": self.matching_resource_id, "type": "outbound_click"},
        )
        self.assertEqual(click_response.status_code, 201)
        with self.app.app_context():
            impression = RecommendationImpression.query.filter_by(
                user_id=self.user_id, resource_id=self.matching_resource_id
            ).first()
            self.assertIsNotNone(impression.opened_at)

    def test_completion_attributes_outcome_to_latest_unresolved_impression(self):
        self.client.get("/api/recommendations", headers=self.headers)

        response = self.client.post(
            f"/api/resources/{self.matching_resource_id}/completion",
            headers=self.headers,
        )
        self.assertEqual(response.status_code, 201)

        with self.app.app_context():
            impression = RecommendationImpression.query.filter_by(
                user_id=self.user_id,
                resource_id=self.matching_resource_id,
            ).first()
            self.assertIsNotNone(impression.completed_at)

    def test_feedback_attributes_more_like_this_and_not_interested_outcomes(self):
        self.client.get("/api/recommendations", headers=self.headers)

        more_like_this = self.client.post(
            "/api/recommendations/feedback",
            headers=self.headers,
            json={"resourceId": self.matching_resource_id, "type": "more_like_this"},
        )
        self.assertEqual(more_like_this.status_code, 201)

        not_interested = self.client.post(
            "/api/recommendations/feedback",
            headers=self.headers,
            json={"resourceId": self.other_resource_id, "type": "not_interested"},
        )
        self.assertEqual(not_interested.status_code, 201)

        with self.app.app_context():
            matching_impression = RecommendationImpression.query.filter_by(
                user_id=self.user_id, resource_id=self.matching_resource_id
            ).first()
            other_impression = RecommendationImpression.query.filter_by(
                user_id=self.user_id, resource_id=self.other_resource_id
            ).first()
            self.assertIsNotNone(matching_impression.more_like_this_at)
            self.assertIsNone(matching_impression.dismissed_at)
            self.assertIsNotNone(other_impression.dismissed_at)
            self.assertIsNone(other_impression.more_like_this_at)

    def test_activity_and_recommendation_confidence_agree_on_feedback_only_signal(self):
        """Regression test for the counting-inconsistency bug: a resource with only
        RecommendationFeedback (no bookmark, no interaction) must count toward
        distinct_interaction_count exactly once, matching what the recommender uses."""
        with self.app.app_context():
            db.session.add(
                RecommendationFeedback(
                    user_id=self.user_id,
                    resource_id=self.other_resource_id,
                    feedback_type="more_like_this",
                )
            )
            db.session.commit()

            shared_count = distinct_interaction_count(self.user_id)

        recommendation_response = self.client.get("/api/recommendations", headers=self.headers)
        activity_response = self.client.get("/api/activity", headers=self.headers)

        self.assertEqual(
            recommendation_response.get_json()["confidence"]["interactionCount"],
            shared_count,
        )
        self.assertEqual(activity_response.get_json()["stats"]["interactionCount"], shared_count)


if __name__ == "__main__":
    unittest.main()
