import unittest

from flask_jwt_extended import create_access_token

from app import create_app
from app.extensions import db
from app.models import CourseCompletion, Resource, User


class GoalsApiTestCase(unittest.TestCase):
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
                title="Python for Data Analysis",
                provider="Coursera",
                url="https://example.com/python-data-analysis",
                description="Analyze data with Python.",
                category="Data Science",
                difficulty="Beginner",
                resource_type="Course",
                skills="Python, Data Analysis",
                field_tags="Data Science",
                search_text="python data analysis",
            )
            second_resource = Resource(
                title="SQL Fundamentals",
                provider="edX",
                url="https://example.com/sql-fundamentals",
                description="Query relational databases.",
                category="Data Science",
                difficulty="Beginner",
                resource_type="Course",
                skills="SQL, Databases",
                field_tags="Data Science",
                search_text="sql fundamentals",
            )
            unrelated_resource = Resource(
                title="Creative Writing",
                provider="FutureLearn",
                url="https://example.com/creative-writing",
                description="Write short fiction.",
                category="Humanities",
                difficulty="Beginner",
                resource_type="Course",
                skills="Writing",
                field_tags="Humanities",
                search_text="creative writing",
            )
            db.session.add_all([first_resource, second_resource, unrelated_resource])
            db.session.flush()

            db.session.add(CourseCompletion(user_id=user.id, resource_id=first_resource.id))

            self.user_id = user.id
            self.token = create_access_token(identity=str(user.id))
            self.other_token = create_access_token(identity=str(other_user.id))
            db.session.commit()

        self.client = self.app.test_client()
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.other_headers = {"Authorization": f"Bearer {self.other_token}"}

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def test_goal_endpoints_require_authentication(self):
        self.assertEqual(self.client.get("/api/goals").status_code, 401)
        self.assertEqual(self.client.post("/api/goals", json={}).status_code, 401)

    def test_create_goal_requires_title_and_tags(self):
        response = self.client.post("/api/goals", json={"title": "", "targetTags": ""}, headers=self.headers)
        self.assertEqual(response.status_code, 400)

    def test_create_goal_computes_progress_from_matching_completions(self):
        response = self.client.post(
            "/api/goals",
            json={
                "title": "Become a data analyst",
                "targetTags": "Python, SQL",
                "targetDate": "2026-12-31",
            },
            headers=self.headers,
        )
        self.assertEqual(response.status_code, 201)
        goal = response.get_json()["goal"]
        self.assertEqual(goal["title"], "Become a data analyst")
        self.assertEqual(goal["targetTags"], ["Python", "SQL"])
        self.assertEqual(goal["targetDate"], "2026-12-31")
        self.assertEqual(goal["status"], "active")
        # Two resources carry Python/SQL/Data Science tags; only one is completed.
        self.assertEqual(goal["progress"]["totalMatched"], 2)
        self.assertEqual(goal["progress"]["completedCount"], 1)
        self.assertEqual(goal["progress"]["percent"], 50)
        # The completed resource is excluded from suggestions; only the open one remains.
        suggested_titles = [course["title"] for course in goal["progress"]["suggestedCourses"]]
        self.assertEqual(suggested_titles, ["SQL Fundamentals"])

    def test_create_goal_rejects_invalid_target_date(self):
        response = self.client.post(
            "/api/goals",
            json={"title": "Learn Python", "targetTags": "Python", "targetDate": "not-a-date"},
            headers=self.headers,
        )
        self.assertEqual(response.status_code, 400)

    def test_list_goals_only_returns_current_user_goals(self):
        self.client.post(
            "/api/goals",
            json={"title": "My goal", "targetTags": "Python"},
            headers=self.headers,
        )
        response = self.client.get("/api/goals", headers=self.other_headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["goals"], [])

    def test_list_goals_filters_by_status(self):
        create_response = self.client.post(
            "/api/goals",
            json={"title": "My goal", "targetTags": "Python"},
            headers=self.headers,
        )
        goal_id = create_response.get_json()["goal"]["id"]
        self.client.patch(f"/api/goals/{goal_id}", json={"status": "completed"}, headers=self.headers)

        active_response = self.client.get("/api/goals?status=active", headers=self.headers)
        self.assertEqual(active_response.status_code, 200)
        self.assertEqual(len(active_response.get_json()["goals"]), 0)

        completed_response = self.client.get("/api/goals?status=completed", headers=self.headers)
        self.assertEqual(len(completed_response.get_json()["goals"]), 1)

        invalid_response = self.client.get("/api/goals?status=bogus", headers=self.headers)
        self.assertEqual(invalid_response.status_code, 400)

    def test_update_goal_sets_completed_at_and_can_reactivate(self):
        create_response = self.client.post(
            "/api/goals",
            json={"title": "My goal", "targetTags": "Python"},
            headers=self.headers,
        )
        goal_id = create_response.get_json()["goal"]["id"]

        complete_response = self.client.patch(
            f"/api/goals/{goal_id}",
            json={"status": "completed"},
            headers=self.headers,
        )
        self.assertEqual(complete_response.status_code, 200)
        completed_goal = complete_response.get_json()["goal"]
        self.assertEqual(completed_goal["status"], "completed")
        self.assertIsNotNone(completed_goal["completedAt"])

        reactivate_response = self.client.patch(
            f"/api/goals/{goal_id}",
            json={"status": "active"},
            headers=self.headers,
        )
        reactivated_goal = reactivate_response.get_json()["goal"]
        self.assertEqual(reactivated_goal["status"], "active")
        self.assertIsNone(reactivated_goal["completedAt"])

    def test_update_goal_rejects_invalid_status(self):
        create_response = self.client.post(
            "/api/goals",
            json={"title": "My goal", "targetTags": "Python"},
            headers=self.headers,
        )
        goal_id = create_response.get_json()["goal"]["id"]
        response = self.client.patch(f"/api/goals/{goal_id}", json={"status": "bogus"}, headers=self.headers)
        self.assertEqual(response.status_code, 400)

    def test_update_goal_not_found_for_other_users_goal(self):
        create_response = self.client.post(
            "/api/goals",
            json={"title": "My goal", "targetTags": "Python"},
            headers=self.headers,
        )
        goal_id = create_response.get_json()["goal"]["id"]
        response = self.client.patch(
            f"/api/goals/{goal_id}",
            json={"title": "Hijacked"},
            headers=self.other_headers,
        )
        self.assertEqual(response.status_code, 404)

    def test_delete_goal(self):
        create_response = self.client.post(
            "/api/goals",
            json={"title": "My goal", "targetTags": "Python"},
            headers=self.headers,
        )
        goal_id = create_response.get_json()["goal"]["id"]

        delete_response = self.client.delete(f"/api/goals/{goal_id}", headers=self.headers)
        self.assertEqual(delete_response.status_code, 200)

        list_response = self.client.get("/api/goals", headers=self.headers)
        self.assertEqual(list_response.get_json()["goals"], [])

    def test_delete_goal_is_idempotent(self):
        response = self.client.delete("/api/goals/999", headers=self.headers)
        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
