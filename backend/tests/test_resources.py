import unittest

from flask_jwt_extended import create_access_token

from app import create_app
from app.extensions import db
from app.models import Resource, User


class ResourceApiTestCase(unittest.TestCase):
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
            self.token = create_access_token(identity=str(user.id))

            db.session.add_all(
                [
                    Resource(
                        title="Data Analysis with Python",
                        provider="Coursera",
                        url="https://example.com/data-python",
                        description="Analyse data and communicate useful findings.",
                        category="Data Science",
                        difficulty="Beginner",
                        rating=4.8,
                        resource_type="Course",
                        skills="Python, Data Analysis",
                        field_tags="Data Science, Statistics",
                        search_text="data analysis python data science statistics",
                    ),
                    Resource(
                        title="Financial Accounting Fundamentals",
                        provider="Coursera",
                        url="https://example.com/accounting",
                        description="Build a practical accounting foundation.",
                        category="Business & Finance",
                        difficulty="Beginner",
                        rating=4.7,
                        resource_type="Course",
                        skills="Accounting",
                        field_tags="Business, Finance, Accounting",
                        search_text="financial accounting business finance",
                    ),
                    Resource(
                        title="Introduction to Psychology",
                        provider="FutureLearn",
                        url="https://example.com/psychology",
                        description="Explore how people think and behave.",
                        category="Social Sciences",
                        difficulty="Unknown",
                        rating=None,
                        resource_type="Course",
                        skills="Research",
                        field_tags="Social Sciences, Psychology",
                        search_text="introduction psychology research social sciences",
                    ),
                    Resource(
                        title="Responsive Web Design",
                        provider="Udemy",
                        url="https://example.com/web-design",
                        description="",
                        category="Web Development",
                        difficulty="All Levels",
                        rating=None,
                        resource_type="Course",
                        skills="",
                        field_tags="Software Engineering, Information Technology",
                        search_text="responsive web design software engineering",
                    ),
                    Resource(
                        title="Project Management Essentials",
                        provider="FutureLearn",
                        url="https://example.com/project-management",
                        description="Plan and deliver projects effectively.",
                        category="General",
                        difficulty="Intermediate",
                        rating=4.5,
                        resource_type="Specialization",
                        skills="Planning, Leadership",
                        field_tags="Management",
                        search_text="project management planning leadership",
                    ),
                ]
            )
            db.session.commit()

        self.client = self.app.test_client()
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def test_catalogue_requires_authentication(self):
        response = self.client.get("/api/resources")
        self.assertEqual(response.status_code, 401)

    def test_catalogue_returns_pagination_and_filter_options(self):
        response = self.client.get("/api/resources?per_page=2", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()

        self.assertEqual(len(payload["resources"]), 2)
        self.assertEqual(payload["pagination"]["total"], 5)
        self.assertEqual(payload["pagination"]["pages"], 3)
        self.assertTrue(payload["pagination"]["hasNext"])
        self.assertIn("Coursera", payload["filterOptions"]["providers"])
        self.assertIn("Social Sciences", payload["filterOptions"]["categories"])

    def test_catalogue_search_and_filters_are_combined(self):
        response = self.client.get(
            "/api/resources?q=python&provider=Coursera&category=Data%20Science",
            headers=self.headers,
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()

        self.assertEqual(payload["pagination"]["total"], 1)
        self.assertEqual(payload["resources"][0]["title"], "Data Analysis with Python")

    def test_list_tags_requires_authentication(self):
        response = self.client.get("/api/resources/tags")
        self.assertEqual(response.status_code, 401)

    def test_list_tags_returns_deduplicated_sorted_skills_and_field_tags(self):
        response = self.client.get("/api/resources/tags", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        tags = response.get_json()["tags"]

        # "Accounting" appears in both skills and field_tags for the same resource.
        self.assertEqual(tags.count("Accounting"), 1)
        self.assertIn("Python", tags)
        self.assertIn("Social Sciences", tags)
        self.assertEqual(tags, sorted(tags, key=str.lower))

    def test_catalogue_supports_sorting_and_page_bounds(self):
        response = self.client.get(
            "/api/resources?sort=title&page=2&per_page=2",
            headers=self.headers,
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["resources"][0]["title"], "Introduction to Psychology")

        empty_page = self.client.get("/api/resources?page=99", headers=self.headers)
        self.assertEqual(empty_page.status_code, 200)
        self.assertEqual(empty_page.get_json()["resources"], [])

    def test_catalogue_rejects_invalid_query_parameters(self):
        self.assertEqual(
            self.client.get("/api/resources?page=0", headers=self.headers).status_code,
            400,
        )
        self.assertEqual(
            self.client.get("/api/resources?per_page=100", headers=self.headers).status_code,
            400,
        )
        self.assertEqual(
            self.client.get("/api/resources?sort=newest", headers=self.headers).status_code,
            400,
        )

    def test_resource_detail_returns_serialized_resource(self):
        with self.app.app_context():
            resource_id = Resource.query.filter_by(title="Data Analysis with Python").one().id

        response = self.client.get(f"/api/resources/{resource_id}", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        resource = response.get_json()["resource"]
        self.assertEqual(resource["resourceType"], "Course")
        self.assertEqual(resource["skills"], ["Python", "Data Analysis"])

        missing = self.client.get("/api/resources/99999", headers=self.headers)
        self.assertEqual(missing.status_code, 404)

    def test_resource_detail_requires_authentication(self):
        with self.app.app_context():
            resource_id = Resource.query.filter_by(title="Data Analysis with Python").one().id

        response = self.client.get(f"/api/resources/{resource_id}")
        self.assertEqual(response.status_code, 401)

    def test_saving_a_resource_requires_authentication(self):
        with self.app.app_context():
            resource_id = Resource.query.filter_by(title="Data Analysis with Python").one().id

        response = self.client.post(f"/api/bookmarks/{resource_id}")
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
