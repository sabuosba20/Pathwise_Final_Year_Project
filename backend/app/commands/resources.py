"""Flask CLI commands for maintaining the Pathwise resource catalogue."""

from __future__ import annotations

import csv
from pathlib import Path
from urllib.parse import urlsplit

import click
from flask import Flask
from sqlalchemy import inspect, select, text

from ..extensions import db
from ..models import Resource


DEFAULT_DATASET_PATH = Path(__file__).resolve().parents[2] / "data" / "resources_import_ready.csv"

CSV_COLUMNS = {
    "title",
    "url",
    "description",
    "category",
    "difficulty",
    "rating",
    "provider",
    "resource_type",
    "skills",
    "field_tags",
    "search_text",
}

REQUIRED_VALUES = {
    "title",
    "url",
    "category",
    "difficulty",
    "provider",
    "resource_type",
    "field_tags",
    "search_text",
}

MAX_LENGTHS = {
    "title": 255,
    "url": 500,
    "category": 120,
    "difficulty": 40,
    "provider": 120,
    "resource_type": 80,
}

MODEL_FIELDS = [
    "title",
    "url",
    "description",
    "category",
    "difficulty",
    "rating",
    "provider",
    "resource_type",
    "skills",
    "field_tags",
    "search_text",
]

# db.create_all() creates the full schema for a fresh database but cannot add
# columns to an older development database. These defaults preserve any legacy
# resource rows when the catalogue columns are introduced.
LEGACY_DEFAULTS = {
    "category": "General",
    "difficulty": "Unknown",
    "resource_type": "Course",
    "search_text": "",
}


def _clean(value: object) -> str:
    return " ".join(str(value or "").strip().split())


def _parse_rating(value: object, row_number: int) -> float | None:
    cleaned = _clean(value)
    if not cleaned:
        return None
    try:
        rating = float(cleaned)
    except ValueError as error:
        raise click.ClickException(f"Row {row_number}: rating must be numeric.") from error
    if not 0 <= rating <= 5:
        raise click.ClickException(f"Row {row_number}: rating must be between 0 and 5.")
    return rating


def _validate_external_url(value: str, row_number: int) -> None:
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
    except ValueError as error:
        raise click.ClickException(f"Row {row_number}: url is malformed.") from error
    if parsed.scheme.lower() not in {"http", "https"} or not hostname:
        raise click.ClickException(
            f"Row {row_number}: url must be an absolute HTTP or HTTPS URL."
        )
    if parsed.username or parsed.password:
        raise click.ClickException(
            f"Row {row_number}: url must not contain embedded credentials."
        )


def _read_dataset(dataset_path: Path) -> list[dict[str, object]]:
    try:
        handle = dataset_path.open("r", encoding="utf-8-sig", newline="")
    except OSError as error:
        raise click.ClickException(f"Unable to open dataset: {dataset_path}") from error

    with handle:
        reader = csv.DictReader(handle)
        headers = set(reader.fieldnames or [])
        missing_columns = CSV_COLUMNS - headers
        if missing_columns:
            missing = ", ".join(sorted(missing_columns))
            raise click.ClickException(f"Dataset is missing required columns: {missing}")

        records: list[dict[str, object]] = []
        seen_urls: set[str] = set()
        for row_number, source in enumerate(reader, start=2):
            record: dict[str, object] = {
                field: _clean(source.get(field)) for field in MODEL_FIELDS if field != "rating"
            }
            record["rating"] = _parse_rating(source.get("rating"), row_number)

            for field in REQUIRED_VALUES:
                if not record[field]:
                    raise click.ClickException(f"Row {row_number}: {field} cannot be blank.")

            for field, maximum in MAX_LENGTHS.items():
                if len(str(record[field])) > maximum:
                    raise click.ClickException(
                        f"Row {row_number}: {field} exceeds the {maximum}-character database limit."
                    )

            url = str(record["url"])
            _validate_external_url(url, row_number)
            if url in seen_urls:
                raise click.ClickException(f"Row {row_number}: duplicate URL in dataset: {url}")
            seen_urls.add(url)
            records.append(record)

    if not records:
        raise click.ClickException("Dataset contains no resource rows.")
    return records


def _ensure_legacy_resource_columns() -> list[str]:
    """Add only missing catalogue columns to a pre-existing resource table."""
    inspector = inspect(db.engine)
    if not inspector.has_table(Resource.__tablename__):
        db.create_all()
        return []

    existing = {column["name"] for column in inspector.get_columns(Resource.__tablename__)}
    required_columns = [
        "category",
        "difficulty",
        "rating",
        "resource_type",
        "search_text",
    ]
    missing = [name for name in required_columns if name not in existing]
    if not missing:
        return []

    preparer = db.engine.dialect.identifier_preparer
    table_name = preparer.quote(Resource.__tablename__)
    with db.engine.begin() as connection:
        for name in missing:
            column = Resource.__table__.columns[name]
            column_name = preparer.quote(name)
            type_sql = column.type.compile(dialect=db.engine.dialect)
            connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {type_sql}"))

        for name, default in LEGACY_DEFAULTS.items():
            if name not in missing:
                continue
            column_name = preparer.quote(name)
            connection.execute(
                # Identifiers come only from model metadata and are dialect-quoted;
                # the sole data value remains parameterized.
                text(
                    f"UPDATE {table_name} SET {column_name} = :default "  # nosec B608
                    f"WHERE {column_name} IS NULL"
                ),
                {"default": default},
            )

    # Add model-declared filter indexes that create_all could not add to an
    # already-existing table.
    for index in Resource.__table__.indexes:
        index.create(bind=db.engine, checkfirst=True)
    return missing


def _record_changed(resource: Resource, record: dict[str, object]) -> bool:
    return any(getattr(resource, field) != record[field] for field in MODEL_FIELDS)


def register_resource_commands(app: Flask) -> None:
    @app.cli.command("import-resources")
    @click.option(
        "--file",
        "dataset_path",
        type=click.Path(path_type=Path, dir_okay=False),
        default=DEFAULT_DATASET_PATH,
        show_default=True,
        help="Canonical resource CSV to import.",
    )
    @click.option(
        "--dry-run",
        is_flag=True,
        help="Validate and compare the dataset, then roll back database changes.",
    )
    def import_resources(dataset_path: Path, dry_run: bool) -> None:
        """Create or update resources using URL as the stable identifier."""
        records = _read_dataset(dataset_path.resolve())
        added_columns = _ensure_legacy_resource_columns()

        existing_resources = db.session.execute(select(Resource)).scalars().all()
        resources_by_url = {resource.url: resource for resource in existing_resources}

        created = 0
        updated = 0
        unchanged = 0

        try:
            for record in records:
                resource = resources_by_url.get(str(record["url"]))
                if resource is None:
                    resource = Resource(**record)
                    db.session.add(resource)
                    resources_by_url[resource.url] = resource
                    created += 1
                elif _record_changed(resource, record):
                    for field in MODEL_FIELDS:
                        setattr(resource, field, record[field])
                    updated += 1
                else:
                    unchanged += 1

            if dry_run:
                db.session.rollback()
            else:
                db.session.commit()
        except Exception:
            db.session.rollback()
            raise

        if added_columns:
            click.echo("Added legacy database columns: " + ", ".join(added_columns))
        click.echo(f"Dataset: {dataset_path.resolve()}")
        click.echo(f"Validated: {len(records):,}")
        click.echo(f"Created: {created:,}")
        click.echo(f"Updated: {updated:,}")
        click.echo(f"Unchanged: {unchanged:,}")
        click.echo("Dry run: database rows were not changed." if dry_run else "Import committed.")
