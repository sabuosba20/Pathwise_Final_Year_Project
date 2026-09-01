import io
import unittest
from unittest.mock import patch

from flask_jwt_extended import create_access_token

from app import create_app
from app.extensions import db
from app.models import User
from app.services.cv_extraction import CvExtractionError, detect_profile_from_text, extract_cv_profile


CV_TEXT = """
Profile
Final-year Computer Science student building full-stack applications.

Skills
Python, Java, C, C++, JavaScript, TypeScript, HTML, CSS, Solidity, React,
Angular, Flask, Rust, SQLite, REST APIs, Git and GitHub

Projects
Personalised course recommender.

Education
Bachelor of Computer Science (Honours)
Asia Pacific University of Technology and Innovation
"""


class CvExtractionServiceTestCase(unittest.TestCase):
    def test_detects_major_and_structured_skills(self):
        result = detect_profile_from_text(CV_TEXT)
        self.assertEqual(result["fieldOfStudy"], "Computer Science")
        self.assertEqual(result["fieldConfidence"], 0.96)
        self.assertIn("Python", result["skills"])
        self.assertIn("C++", result["skills"])
        self.assertIn("REST APIs", result["skills"])
        self.assertIn("GitHub", result["skills"])
        self.assertEqual(result["warnings"], [])

    def test_repairs_character_spaced_pdf_text(self):
        spaced_text = """
S k i l l s
P y t h o n ,  J a v a S c r i p t ,  R e a c t
E d u c a t i o n
B a c h e l o r  o f  C o m p u t e r  S c i e n c e  ( H o n o u r s )
"""
        result = detect_profile_from_text(spaced_text)
        self.assertEqual(result["fieldOfStudy"], "Computer Science")
        self.assertEqual(result["skills"], ["Python", "JavaScript", "React"])

    def test_rejects_unsupported_file_type(self):
        with self.assertRaises(CvExtractionError) as context:
            extract_cv_profile(io.BytesIO(b"plain text"), "cv.txt", 1024)
        self.assertEqual(context.exception.status_code, 415)

    def test_rejects_spoofed_pdf_extension(self):
        with self.assertRaises(CvExtractionError) as context:
            extract_cv_profile(io.BytesIO(b"not a pdf"), "cv.pdf", 1024)
        self.assertEqual(context.exception.status_code, 415)


class CvExtractionApiTestCase(unittest.TestCase):
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
            user = User(name="CV Tester", email="cv@example.com")
            user.set_password("test-password")
            db.session.add(user)
            db.session.commit()
            self.token = create_access_token(identity=str(user.id))
        self.client = self.app.test_client()
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def test_cv_extract_requires_authentication(self):
        response = self.client.post("/api/preferences/cv-extract")
        self.assertEqual(response.status_code, 401)

    def test_cv_extract_requires_a_file(self):
        response = self.client.post("/api/preferences/cv-extract", headers=self.headers)
        self.assertEqual(response.status_code, 400)

    @patch("app.routes.preferences.extract_cv_profile")
    def test_cv_extract_returns_reviewable_suggestions(self, mocked_extract):
        mocked_extract.return_value = {
            "fieldOfStudy": "Computer Science",
            "fieldConfidence": 0.96,
            "skills": ["Python", "React"],
            "warnings": [],
            "fileType": "PDF",
        }
        response = self.client.post(
            "/api/preferences/cv-extract",
            headers=self.headers,
            data={"cv": (io.BytesIO(b"placeholder"), "cv.pdf")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["fieldOfStudy"], "Computer Science")
        self.assertEqual(response.get_json()["skills"], ["Python", "React"])


if __name__ == "__main__":
    unittest.main()
