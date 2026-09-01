import unittest

from flask_jwt_extended import create_access_token

from app import create_app
from app.extensions import db
from app.models import (
    Bookmark,
    CourseCompletion,
    Goal,
    Interaction,
    Preference,
    RecommendationFeedback,
    Resource,
    ResourceRating,
    User,
)
from app.services import invalidate_cache, weight_for_confidence


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


class RecommendationApiTestCase(unittest.TestCase):
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

            self.relevant_resource = _make_resource(
                1,
                "Data Science",
                "Python and Machine Learning",
                "Data Science, Computer Science",
                "python data science machine learning statistics programming",
            )
            self.unrelated_resource = _make_resource(
                2,
                "Social Sciences",
                "Research, Ethnography",
                "Psychology, Social Sciences",
                "psychology human behaviour research ethnography qualitative",
            )
            self.similar_resource = _make_resource(
                28,
                "Data Science",
                "Python, Data Analysis",
                "Data Science, Computer Science",
                "python data analysis visualization programming statistics",
            )
            db.session.add_all(
                [self.relevant_resource, self.unrelated_resource, self.similar_resource]
            )

            # Extra resources so a filler user can push the global implicit-rating
            # count over the collaborative model's minimum training threshold.
            self.filler_resources = [
                _make_resource(index, "General", "", "General", f"general studies topic {index}")
                for index in range(3, 3 + 25)
            ]
            db.session.add_all(self.filler_resources)
            db.session.flush()

            self.user = User(name="FYP Tester", email="tester@example.com")
            self.user.set_password("test-password")
            db.session.add(self.user)
            db.session.flush()
            db.session.add(
                Preference(
                    user_id=self.user.id,
                    field_of_study="Computer Science",
                    skills="Python, SQL",
                    learning_goals="Build stronger data analysis skills",
                )
            )

            self.no_preference_user = User(name="No Preference", email="noprefs@example.com")
            self.no_preference_user.set_password("test-password")
            db.session.add(self.no_preference_user)

            db.session.commit()

            # Capture plain values while the session is still live -- the ORM
            # instances themselves become detached once this context exits.
            self.relevant_resource_id = self.relevant_resource.id
            self.unrelated_resource_id = self.unrelated_resource.id
            self.similar_resource_id = self.similar_resource.id
            self.filler_resource_ids = [resource.id for resource in self.filler_resources]
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

    def _add_filler_interactions(self):
        """Give a separate user enough distinct interactions to satisfy the
        collaborative model's global minimum-data threshold."""
        with self.app.app_context():
            filler = User(name="Filler", email="filler@example.com")
            filler.set_password("test-password")
            db.session.add(filler)
            db.session.flush()
            for resource_id in self.filler_resource_ids:
                db.session.add(Interaction(user_id=filler.id, resource_id=resource_id, interaction_type="view"))
            db.session.commit()

    def test_recommendations_require_authentication(self):
        response = self.client.get("/api/recommendations")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(
            self.client.post(
                "/api/recommendations/feedback",
                json={
                    "resourceId": self.relevant_resource_id,
                    "type": "more_like_this",
                },
            ).status_code,
            401,
        )

    def test_cold_start_user_is_purely_content_based_and_ranks_relevant_resources_higher(self):
        response = self.client.get("/api/recommendations?limit=5", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()

        self.assertTrue(payload["personalized"])
        self.assertEqual(payload["confidence"]["interactionCount"], 0)
        self.assertEqual(payload["confidence"]["weightCollaborative"], 0.0)
        self.assertEqual(payload["confidence"]["weightContent"], 1.0)

        resource_ids = [item["resource"]["id"] for item in payload["recommendations"]]
        self.assertIn(self.relevant_resource_id, resource_ids)
        relevant_index = resource_ids.index(self.relevant_resource_id)
        if self.unrelated_resource_id in resource_ids:
            self.assertLess(relevant_index, resource_ids.index(self.unrelated_resource_id))

    def test_recommendation_reason_excludes_stop_words(self):
        response = self.client.get("/api/recommendations?limit=5", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()

        relevant_item = next(
            item
            for item in payload["recommendations"]
            if item["resource"]["id"] == self.relevant_resource_id
        )
        self.assertNotIn(" and", relevant_item["reason"].lower())

    def test_user_without_preference_gets_unpersonalized_fallback(self):
        response = self.client.get(
            "/api/recommendations",
            headers={"Authorization": f"Bearer {self.no_preference_token}"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()

        self.assertFalse(payload["personalized"])
        self.assertGreater(len(payload["recommendations"]), 0)
        self.assertIsNone(payload["recommendations"][0]["score"])
        self.assertIsNone(payload["recommendations"][0]["reason"])

    def test_saved_course_seeds_recommendations_without_learning_profile(self):
        with self.app.app_context():
            db.session.add(
                Bookmark(
                    user_id=self.no_preference_user_id,
                    resource_id=self.relevant_resource_id,
                )
            )
            db.session.commit()
        invalidate_cache()

        response = self.client.get(
            "/api/recommendations?limit=5",
            headers={"Authorization": f"Bearer {self.no_preference_token}"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()

        self.assertTrue(payload["personalized"])
        self.assertFalse(payload["confidence"]["contentSources"]["learningProfile"])
        self.assertEqual(payload["confidence"]["contentSources"]["savedCourseCount"], 1)

        resource_ids = [item["resource"]["id"] for item in payload["recommendations"]]
        self.assertNotIn(self.relevant_resource_id, resource_ids)
        self.assertEqual(resource_ids[0], self.similar_resource_id)
        self.assertIn(
            "which you saved",
            payload["recommendations"][0]["reason"],
        )

    def test_active_goal_seeds_recommendations_and_is_excluded_when_abandoned(self):
        with self.app.app_context():
            goal = Goal(
                user_id=self.no_preference_user_id,
                title="Break into machine learning",
                target_tags="Machine Learning",
            )
            db.session.add(goal)
            db.session.commit()
            goal_id = goal.id
        invalidate_cache()

        response = self.client.get(
            "/api/recommendations?limit=5",
            headers={"Authorization": f"Bearer {self.no_preference_token}"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()

        self.assertTrue(payload["personalized"])
        self.assertEqual(payload["confidence"]["contentSources"]["activeGoalCount"], 1)

        resource_ids = [item["resource"]["id"] for item in payload["recommendations"]]
        self.assertEqual(resource_ids[0], self.relevant_resource_id)
        top_reasons = [reason["type"] for reason in payload["recommendations"][0]["reasons"]]
        self.assertIn("active_goal", top_reasons)
        self.assertIn(
            "your active goal around machine",
            payload["recommendations"][0]["reason"].lower(),
        )

        # Abandoning the goal should stop it from seeding recommendations.
        with self.app.app_context():
            db.session.get(Goal, goal_id).status = "abandoned"
            db.session.commit()
        invalidate_cache()

        response = self.client.get(
            "/api/recommendations?limit=5",
            headers={"Authorization": f"Bearer {self.no_preference_token}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["confidence"]["contentSources"]["activeGoalCount"], 0)

    def test_completed_course_is_excluded_and_seeds_next_course_reason(self):
        with self.app.app_context():
            db.session.add(
                CourseCompletion(
                    user_id=self.no_preference_user_id,
                    resource_id=self.relevant_resource_id,
                )
            )
            db.session.commit()
        invalidate_cache()

        payload = self.client.get(
            "/api/recommendations?limit=5",
            headers={"Authorization": f"Bearer {self.no_preference_token}"},
        ).get_json()

        self.assertTrue(payload["personalized"])
        self.assertEqual(
            payload["confidence"]["contentSources"]["completedCourseCount"],
            1,
        )
        resource_ids = [
            item["resource"]["id"] for item in payload["recommendations"]
        ]
        self.assertNotIn(self.relevant_resource_id, resource_ids)
        similar_item = next(
            item
            for item in payload["recommendations"]
            if item["resource"]["id"] == self.similar_resource_id
        )
        completion_reasons = [
            reason
            for reason in similar_item["reasons"]
            if reason["type"] == "completed_course"
        ]
        self.assertEqual(len(completion_reasons), 1)
        self.assertIn("which you completed", completion_reasons[0]["text"])

    def test_low_rated_completion_is_excluded_without_positive_seeding(self):
        with self.app.app_context():
            db.session.add(
                CourseCompletion(
                    user_id=self.no_preference_user_id,
                    resource_id=self.relevant_resource_id,
                )
            )
            db.session.add(
                ResourceRating(
                    user_id=self.no_preference_user_id,
                    resource_id=self.relevant_resource_id,
                    rating=2,
                )
            )
            db.session.commit()
        invalidate_cache()

        payload = self.client.get(
            "/api/recommendations?limit=5",
            headers={"Authorization": f"Bearer {self.no_preference_token}"},
        ).get_json()

        self.assertFalse(payload["personalized"])
        self.assertEqual(
            payload["confidence"]["contentSources"]["completedCourseCount"],
            1,
        )
        self.assertNotIn(
            self.relevant_resource_id,
            [
                item["resource"]["id"]
                for item in payload["recommendations"]
            ],
        )

    def test_meaningless_profile_uses_unpersonalized_fallback(self):
        with self.app.app_context():
            db.session.add(
                Preference(
                    user_id=self.no_preference_user_id,
                    field_of_study="a",
                    skills="a",
                    learning_goals="",
                )
            )
            db.session.commit()
        invalidate_cache()

        response = self.client.get(
            "/api/recommendations?limit=5",
            headers={"Authorization": f"Bearer {self.no_preference_token}"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()

        self.assertFalse(payload["personalized"])
        self.assertTrue(
            all(item["reason"] is None for item in payload["recommendations"])
        )

    def test_feedback_is_validated_upserted_and_removable(self):
        invalid_type = self.client.post(
            "/api/recommendations/feedback",
            headers=self.headers,
            json={
                "resourceId": self.relevant_resource_id,
                "type": "love_it",
            },
        )
        self.assertEqual(invalid_type.status_code, 400)

        invalid_rank = self.client.post(
            "/api/recommendations/feedback",
            headers=self.headers,
            json={
                "resourceId": self.relevant_resource_id,
                "type": "more_like_this",
                "recommendationRank": 0,
            },
        )
        self.assertEqual(invalid_rank.status_code, 400)

        created = self.client.post(
            "/api/recommendations/feedback",
            headers=self.headers,
            json={
                "resourceId": self.relevant_resource_id,
                "type": "more_like_this",
                "recommendationRank": 1,
                "recommendationReason": "Matches your interest in python.",
            },
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.get_json()["feedback"]["type"], "more_like_this")

        updated = self.client.post(
            "/api/recommendations/feedback",
            headers=self.headers,
            json={
                "resourceId": self.relevant_resource_id,
                "type": "not_interested",
                "recommendationRank": 1,
            },
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.get_json()["feedback"]["type"], "not_interested")
        with self.app.app_context():
            self.assertEqual(
                RecommendationFeedback.query.filter_by(
                    user_id=self.user_id,
                    resource_id=self.relevant_resource_id,
                ).count(),
                1,
            )

        removed = self.client.delete(
            f"/api/recommendations/feedback/{self.relevant_resource_id}",
            headers=self.headers,
        )
        self.assertEqual(removed.status_code, 200)
        self.assertFalse(removed.get_json()["hasFeedback"])
        with self.app.app_context():
            self.assertEqual(RecommendationFeedback.query.count(), 0)

    def test_more_like_this_feedback_personalizes_and_boosts_similar_courses(self):
        created = self.client.post(
            "/api/recommendations/feedback",
            headers={"Authorization": f"Bearer {self.no_preference_token}"},
            json={
                "resourceId": self.relevant_resource_id,
                "type": "more_like_this",
                "recommendationRank": 1,
                "recommendationReason": "A data science match.",
            },
        )
        self.assertEqual(created.status_code, 201)

        response = self.client.get(
            "/api/recommendations?limit=5",
            headers={"Authorization": f"Bearer {self.no_preference_token}"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()

        self.assertTrue(payload["personalized"])
        self.assertEqual(
            payload["confidence"]["contentSources"]["positiveFeedbackCount"],
            1,
        )
        recommendation_ids = [
            item["resource"]["id"] for item in payload["recommendations"]
        ]
        self.assertIn(self.similar_resource_id, recommendation_ids)
        if self.unrelated_resource_id in recommendation_ids:
            self.assertLess(
                recommendation_ids.index(self.similar_resource_id),
                recommendation_ids.index(self.unrelated_resource_id),
            )
        similar_item = next(
            item
            for item in payload["recommendations"]
            if item["resource"]["id"] == self.similar_resource_id
        )
        self.assertIn("asked for more courses like", similar_item["reason"])

        source_item = next(
            (
                item
                for item in payload["recommendations"]
                if item["resource"]["id"] == self.relevant_resource_id
            ),
            None,
        )
        if source_item is not None:
            self.assertEqual(source_item["feedbackType"], "more_like_this")

    def test_not_interested_feedback_excludes_resource_and_can_be_undone(self):
        hidden = self.client.post(
            "/api/recommendations/feedback",
            headers=self.headers,
            json={
                "resourceId": self.relevant_resource_id,
                "type": "not_interested",
                "recommendationRank": 1,
            },
        )
        self.assertEqual(hidden.status_code, 201)

        hidden_payload = self.client.get(
            "/api/recommendations?limit=24",
            headers=self.headers,
        ).get_json()
        hidden_ids = [
            item["resource"]["id"]
            for item in hidden_payload["recommendations"]
        ]
        self.assertNotIn(self.relevant_resource_id, hidden_ids)
        self.assertEqual(
            hidden_payload["confidence"]["contentSources"]["negativeFeedbackCount"],
            1,
        )

        self.client.delete(
            f"/api/recommendations/feedback/{self.relevant_resource_id}",
            headers=self.headers,
        )
        restored_payload = self.client.get(
            "/api/recommendations?limit=24",
            headers=self.headers,
        ).get_json()
        restored_ids = [
            item["resource"]["id"]
            for item in restored_payload["recommendations"]
        ]
        self.assertIn(self.relevant_resource_id, restored_ids)

    def test_recommendation_exposes_every_available_explanation_signal(self):
        with self.app.app_context():
            db.session.add(
                Bookmark(
                    user_id=self.user_id,
                    resource_id=self.relevant_resource_id,
                )
            )
            db.session.add(
                RecommendationFeedback(
                    user_id=self.user_id,
                    resource_id=self.relevant_resource_id,
                    feedback_type="more_like_this",
                    recommendation_rank=1,
                )
            )
            db.session.commit()
        invalidate_cache()

        response = self.client.get(
            "/api/recommendations?limit=5",
            headers=self.headers,
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        similar_item = next(
            item
            for item in payload["recommendations"]
            if item["resource"]["id"] == self.similar_resource_id
        )
        reason_types = {
            reason["type"] for reason in similar_item["reasons"]
        }

        self.assertTrue(
            {
                "direct_feedback",
                "saved_course",
                "skills",
                "field_of_study",
                "learning_goal",
                "profile_interest",
            }.issubset(reason_types)
        )
        self.assertEqual(
            similar_item["reason"],
            similar_item["reasons"][0]["text"],
        )
        self.assertTrue(
            all(
                reason["label"] and reason["text"]
                for reason in similar_item["reasons"]
            )
        )

    def test_diversity_reranker_preserves_top_match_and_reduces_duplicates(self):
        with self.app.app_context():
            duplicate_resources = [
                Resource(
                    title=f"Python Data Science Course {index}",
                    provider="Same Provider",
                    url=f"https://example.com/duplicate-data-science-{index}",
                    description="A highly similar Python data science course.",
                    category="Data Science",
                    difficulty="Beginner",
                    rating=4.8,
                    resource_type="Course",
                    skills="Python, Data Analysis",
                    field_tags="Computer Science, Data Science",
                    search_text="python data science analysis programming statistics",
                )
                for index in range(6)
            ]
            diverse_resources = [
                Resource(
                    title="Applied Python Professional Certificate",
                    provider="edX",
                    url="https://example.com/diverse-python-certificate",
                    description="Applied Python and data analysis.",
                    category="Computer Science",
                    difficulty="Intermediate",
                    rating=4.7,
                    resource_type="Professional Certificate",
                    skills="Python, Data Analysis",
                    field_tags="Computer Science",
                    search_text="python data science analysis programming statistics",
                ),
                Resource(
                    title="Data Engineering Nanodegree",
                    provider="Udacity",
                    url="https://example.com/diverse-data-nanodegree",
                    description="Data engineering with Python.",
                    category="Information Technology",
                    difficulty="Advanced",
                    rating=4.7,
                    resource_type="Nanodegree",
                    skills="Python, Data Engineering",
                    field_tags="Computer Science, Information Technology",
                    search_text="python data science analysis programming statistics",
                ),
            ]
            db.session.add_all(duplicate_resources + diverse_resources)
            db.session.commit()
        invalidate_cache()

        first_response = self.client.get(
            "/api/recommendations?limit=8",
            headers=self.headers,
        )
        second_response = self.client.get(
            "/api/recommendations?limit=8",
            headers=self.headers,
        )
        self.assertEqual(first_response.status_code, 200)
        first_payload = first_response.get_json()
        second_payload = second_response.get_json()
        first_ids = [
            item["resource"]["id"]
            for item in first_payload["recommendations"]
        ]
        second_ids = [
            item["resource"]["id"]
            for item in second_payload["recommendations"]
        ]

        self.assertEqual(first_ids, second_ids)
        self.assertEqual(
            first_payload["recommendations"][0]["breakdown"]["relevanceRank"],
            1,
        )
        diversity = first_payload["confidence"]["diversity"]
        self.assertEqual(
            diversity["strategy"],
            "maximal_marginal_relevance",
        )
        self.assertGreaterEqual(diversity["uniqueProviders"], 2)
        self.assertGreaterEqual(diversity["uniqueCategories"], 2)
        promoted_items = [
            item
            for item in first_payload["recommendations"]
            if item["breakdown"]["diversityPromoted"]
        ]
        self.assertTrue(promoted_items)
        self.assertTrue(
            any(
                reason["type"] == "discovery_balance"
                for item in promoted_items
                for reason in item["reasons"]
            )
        )

    def test_weight_ramps_with_interaction_count(self):
        self._add_filler_interactions()

        for n in (0, 5, 8, 12):
            with self.app.app_context():
                Interaction.query.filter_by(user_id=self.user_id).delete()
                Bookmark.query.filter_by(user_id=self.user_id).delete()
                for resource_id in self.filler_resource_ids[:n]:
                    db.session.add(
                        Interaction(user_id=self.user_id, resource_id=resource_id, interaction_type="view")
                    )
                db.session.commit()
            invalidate_cache()

            response = self.client.get("/api/recommendations", headers=self.headers)
            self.assertEqual(response.status_code, 200)
            payload = response.get_json()

            expected_content, expected_collab = weight_for_confidence(n)
            self.assertEqual(payload["confidence"]["interactionCount"], n)
            self.assertAlmostEqual(payload["confidence"]["weightCollaborative"], round(expected_collab, 4))
            self.assertAlmostEqual(payload["confidence"]["weightContent"], round(expected_content, 4))

    def test_insufficient_global_data_defaults_collaborative_score_to_zero(self):
        with self.app.app_context():
            db.session.add(
                Interaction(user_id=self.user_id, resource_id=self.relevant_resource_id, interaction_type="view")
            )
            db.session.commit()
        invalidate_cache()

        response = self.client.get("/api/recommendations", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["confidence"]["weightCollaborative"], 0.0)


if __name__ == "__main__":
    unittest.main()
