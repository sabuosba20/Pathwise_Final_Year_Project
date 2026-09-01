import unittest

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import create_app
from app.extensions import db


class DatabaseIntegrityTestCase(unittest.TestCase):
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

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def test_sqlite_foreign_keys_are_enabled_for_application_connections(self):
        with self.app.app_context():
            enabled = db.session.execute(
                text("PRAGMA foreign_keys")
            ).scalar_one()

        self.assertEqual(enabled, 1)

    def test_sqlite_rejects_orphaned_related_records(self):
        with self.app.app_context():
            with self.assertRaises(IntegrityError):
                db.session.execute(
                    text(
                        """
                        INSERT INTO course_completion
                            (user_id, resource_id, completed_at)
                        VALUES
                            (999999, 999999, CURRENT_TIMESTAMP)
                        """
                    )
                )
                db.session.commit()
            db.session.rollback()

            self.assertEqual(
                db.session.execute(
                    text("SELECT COUNT(*) FROM course_completion")
                ).scalar_one(),
                0,
            )


if __name__ == "__main__":
    unittest.main()
