"""Build Pathwise's canonical, import-ready course catalogue.

The existing merged dataset is useful preprocessing evidence, but its display
text was lowercased and stripped of punctuation. This builder keeps the merged
dataset's selected rows while restoring human-readable metadata from the raw
source files by URL.
"""

from __future__ import annotations

import argparse
import html
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import pandas as pd


OUTPUT_COLUMNS = [
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

REQUIRED_SOURCE_FILES = {
    "merged": "final_merged_courses.csv",
    "online": "Online_Courses.csv",
    "udemy": "udemy_courses.csv",
}

ALLOWED_DIFFICULTIES = {
    "Beginner",
    "Intermediate",
    "Advanced",
    "All Levels",
    "Unknown",
}

PROVIDER_NAMES = {
    "coursera": "Coursera",
    "future learn": "FutureLearn",
    "futurelearn": "FutureLearn",
    "simplilearn": "Simplilearn",
    "udacity": "Udacity",
    "udemy": "Udemy",
}

CATEGORY_ALIASES = {
    "arts and humanities": "Arts & Humanities",
    "business": "Business",
    "business finance": "Business & Finance",
    "computer science": "Computer Science",
    "data science": "Data Science",
    "general": "General",
    "graphic design": "Graphic Design",
    "health": "Health",
    "information technology": "Information Technology",
    "language learning": "Language Learning",
    "math and logic": "Math & Logic",
    "musical instruments": "Music",
    "negcios": "Business",
    "negocios": "Business",
    "negócios": "Business",
    "personal development": "Personal Development",
    "physical science and engineering": "Physical Science & Engineering",
    "social sciences": "Social Sciences",
    "web development": "Web Development",
    "データサイエンス": "Data Science",
    "ãƒ‡ãƒ¼ã‚¿ã‚µã‚¤ã‚¨ãƒ³ã‚¹": "Data Science",
}

CATEGORY_FIELDS = {
    "Arts & Humanities": ["Arts & Humanities", "Creative Arts"],
    "Business": ["Business", "Management", "Marketing", "Entrepreneurship"],
    "Business & Finance": ["Business", "Finance", "Accounting", "Management"],
    "Computer Science": ["Computer Science", "Software Engineering", "Information Technology"],
    "Data Science": ["Data Science", "Computer Science", "Mathematics", "Statistics"],
    "Graphic Design": ["Design", "Creative Arts", "Multimedia"],
    "Health": ["Health Sciences", "Medicine", "Nursing"],
    "Information Technology": ["Information Technology", "Computer Science", "Cybersecurity"],
    "Language Learning": ["Languages", "Linguistics", "Communication"],
    "Math & Logic": ["Mathematics", "Statistics"],
    "Music": ["Music", "Performing Arts"],
    "Personal Development": ["Personal Development", "Career Development"],
    "Physical Science & Engineering": ["Engineering", "Physical Sciences"],
    "Social Sciences": ["Social Sciences", "Psychology", "Sociology"],
    "Web Development": ["Software Engineering", "Information Technology", "Computer Science"],
}

# These patterns are intentionally broad degree/discipline signals. They help
# classify the many FutureLearn records whose source category is "General".
FIELD_KEYWORDS = {
    "Accounting": (r"\baccount", r"\baudit", r"\btaxation\b", r"bookkeep"),
    "Agriculture": (r"\bagricultur", r"\bfarming\b", r"\bcrop", r"\bsoil\b"),
    "Architecture": (r"\barchitectur", r"\burban design\b", r"\bbim\b"),
    "Business": (r"\bbusiness\b", r"\bcommerce\b", r"entrepreneur", r"\bstartup"),
    "Communication": (r"\bcommunication", r"\bpublic speaking\b", r"\bjournalis"),
    "Computer Science": (r"\bcomputer science\b", r"\bprogramming\b", r"\bcoding\b", r"algorithm"),
    "Creative Arts": (r"\bart\b", r"\bcreative\b", r"\billustrat", r"\bphotograph", r"\banimation\b"),
    "Cybersecurity": (r"cybersecurity", r"cyber security", r"information security", r"\bethical hacking\b"),
    "Data Science": (r"\bdata science\b", r"\bdata analy", r"machine learning", r"artificial intelligence"),
    "Design": (r"\bdesign\b", r"\bux\b", r"\bui\b", r"user experience"),
    "Education": (r"\beducation\b", r"\bteaching\b", r"\bteacher", r"\bpedagog"),
    "Engineering": (r"\bengineering\b", r"\bmechanical\b", r"\belectrical\b", r"\bcivil engineering\b"),
    "Finance": (r"\bfinance\b", r"\bfinancial\b", r"\binvest", r"\bbanking\b"),
    "Health Sciences": (r"\bhealth", r"\bmedical\b", r"\bmedicine\b", r"\bnursing\b", r"\bclinical\b"),
    "Hospitality": (r"\bhospitality\b", r"\btourism\b", r"\bhotel management\b"),
    "Information Technology": (r"information technology", r"\bit support\b", r"cloud computing", r"\bnetworking\b"),
    "Languages": (r"\blanguage learning\b", r"\benglish language\b", r"\bspanish\b", r"\bfrench\b", r"\blinguistic"),
    "Law": (r"\blaw\b", r"\blegal\b", r"\bjustice\b", r"\bcriminolog"),
    "Management": (r"\bmanagement\b", r"\bleadership\b", r"project management", r"human resources"),
    "Marketing": (r"\bmarketing\b", r"social media", r"\bbranding\b", r"consumer behavior"),
    "Mathematics": (r"\bmathematics\b", r"\bcalculus\b", r"\balgebra\b", r"\bstatistics\b"),
    "Multimedia": (r"\bmultimedia\b", r"video editing", r"graphic design", r"game design"),
    "Music": (r"\bmusic\b", r"\bguitar\b", r"\bpiano\b", r"\bvocal"),
    "Natural Sciences": (r"\bbiology\b", r"\bchemistry\b", r"\bphysics\b", r"environmental science"),
    "Psychology": (r"\bpsycholog", r"mental health", r"human behaviour", r"human behavior"),
    "Social Sciences": (r"social science", r"\bsociolog", r"\bpolitic", r"international relations"),
    "Software Engineering": (r"software development", r"web development", r"\bdeveloper\b", r"\bjavascript\b", r"\bpython\b"),
}

GENERIC_ROOT_DOMAINS = {
    "coursera.org",
    "futurelearn.com",
    "simplilearn.com",
    "udacity.com",
    "udemy.com",
}

TRACKING_QUERY_KEYS = {"fbclid", "gclid", "mc_cid", "mc_eid"}


def clean_display(value: object) -> str:
    """Preserve readable text while removing only markup noise and whitespace."""
    if value is None or pd.isna(value):
        return ""
    text = html.unescape(str(value)).strip()
    if text.casefold() in {"nan", "none", "<na>"}:
        return ""
    return " ".join(text.split())


def normalize_for_search(value: object) -> str:
    text = clean_display(value).casefold()
    text = re.sub(r"[^\w+#.&-]+", " ", text, flags=re.UNICODE)
    return " ".join(text.split())


def first_nonempty(*values: object) -> str:
    for value in values:
        cleaned = clean_display(value)
        if cleaned:
            return cleaned
    return ""


def normalize_url(value: object) -> str:
    raw = clean_display(value)
    if not raw or re.search(r"\s", raw):
        return ""

    try:
        parsed = urlsplit(raw)
    except ValueError:
        return ""

    if parsed.scheme.casefold() not in {"http", "https"} or not parsed.netloc:
        return ""

    host = parsed.netloc.casefold()
    path = parsed.path.rstrip("/") or "/"
    query = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if not key.casefold().startswith("utm_") and key.casefold() not in TRACKING_QUERY_KEYS
    ]
    return urlunsplit((parsed.scheme.casefold(), host, path, urlencode(sorted(query)), ""))


def is_generic_homepage(url: str) -> bool:
    parsed = urlsplit(url)
    host = parsed.hostname.casefold().removeprefix("www.") if parsed.hostname else ""
    return parsed.path in {"", "/"} and host in GENERIC_ROOT_DOMAINS


def normalize_provider(value: object) -> str:
    provider = clean_display(value)
    return PROVIDER_NAMES.get(provider.casefold(), provider.title() or "Unknown")


def normalize_category(value: object) -> str:
    category = clean_display(value)
    if not category:
        return "General"
    return CATEGORY_ALIASES.get(category.casefold(), category.title())


def normalize_difficulty(value: object) -> str:
    difficulty = clean_display(value).casefold()
    if not difficulty or difficulty in {"nan", "none", "unknown", "not specified"}:
        return "Unknown"
    if difficulty in {"all", "all level", "all levels"}:
        return "All Levels"
    if difficulty in {"beginner", "beginner level", "introductory"}:
        return "Beginner"
    if difficulty in {"intermediate", "intermediate level", "mixed"}:
        return "Intermediate"
    if difficulty in {"advanced", "advanced level", "expert", "expert level"}:
        return "Advanced"
    return "Unknown"


def normalize_resource_type(*values: object) -> str:
    value = first_nonempty(*values).casefold()
    if not value or value in {"nan", "none"}:
        return "Course"
    if value in {"course", "course ", "free course"}:
        return "Course"
    if value in {"project", "guided project"}:
        return "Project"
    if "professional certificate" in value:
        return "Professional Certificate"
    if "specialization" in value:
        return "Specialization"
    if "nanodegree" in value:
        return "Nanodegree Program"
    if "executive program" in value:
        return "Executive Program"
    return clean_display(value).title()


def parse_rating(*values: object) -> float | None:
    for value in values:
        text = clean_display(value)
        match = re.search(r"\d+(?:\.\d+)?", text)
        if not match:
            continue
        rating = float(match.group())
        if 0 <= rating <= 5:
            return round(rating, 2)
    return None


def clean_skills(value: object) -> str:
    raw = clean_display(value)
    if not raw:
        return ""
    seen: set[str] = set()
    skills: list[str] = []
    for part in re.split(r"[,;|]", raw):
        skill = clean_display(part).strip(" .")
        key = skill.casefold()
        if skill and key not in seen:
            seen.add(key)
            skills.append(skill)
    return ", ".join(skills)


def infer_field_tags(category: str, searchable_text: str) -> str:
    tags = list(CATEGORY_FIELDS.get(category, []))
    if category == "General":
        for field, patterns in FIELD_KEYWORDS.items():
            if field in tags:
                continue
            if any(re.search(pattern, searchable_text, flags=re.IGNORECASE) for pattern in patterns):
                tags.append(field)
            if len(tags) >= 4:
                break
    if not tags:
        tags.append("General Studies")
    return ", ".join(tags[:4])


def metadata_score(row: pd.Series, columns: list[str]) -> int:
    return sum(bool(clean_display(row.get(column))) for column in columns)


def build_lookup(
    frame: pd.DataFrame,
    url_column: str,
    score_columns: list[str],
) -> dict[str, pd.Series]:
    lookup: dict[str, pd.Series] = {}
    scores: dict[str, int] = {}
    for _, row in frame.iterrows():
        url = normalize_url(row.get(url_column))
        if not url:
            continue
        score = metadata_score(row, score_columns)
        if url not in lookup or score > scores[url]:
            lookup[url] = row
            scores[url] = score
    return lookup


def build_dataset(source_dir: Path) -> tuple[pd.DataFrame, dict[str, object]]:
    files = {name: source_dir / filename for name, filename in REQUIRED_SOURCE_FILES.items()}
    missing = [str(path) for path in files.values() if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing required source files: " + ", ".join(missing))

    merged = pd.read_csv(files["merged"], low_memory=False)
    online = pd.read_csv(files["online"], low_memory=False)
    udemy = pd.read_csv(files["udemy"], low_memory=False)

    online_lookup = build_lookup(
        online,
        "URL",
        ["Title", "Short Intro", "Category", "Level", "Rating", "Site", "Skills", "Course Type"],
    )
    udemy_lookup = build_lookup(
        udemy,
        "url",
        ["course_title", "subject", "level"],
    )

    drops: Counter[str] = Counter()
    recovery: Counter[str] = Counter()
    records: list[dict[str, object]] = []

    for _, base in merged.iterrows():
        raw_url = clean_display(base.get("url"))
        if not raw_url:
            drops["missing_url"] += 1
            continue

        url = normalize_url(raw_url)
        if not url:
            drops["invalid_url"] += 1
            continue
        if is_generic_homepage(url):
            drops["generic_homepage"] += 1
            continue

        base_provider = normalize_provider(base.get("platform"))
        raw = udemy_lookup.get(url) if base_provider == "Udemy" else online_lookup.get(url)
        if raw is not None:
            recovery["raw_url_matches"] += 1
            recovery[f"{base_provider}_raw_matches"] += 1

        if base_provider == "Udemy":
            raw_title = raw.get("course_title") if raw is not None else ""
            raw_description = ""
            raw_category = raw.get("subject") if raw is not None else ""
            raw_difficulty = raw.get("level") if raw is not None else ""
            raw_rating = ""
            raw_provider = "Udemy"
            raw_skills = ""
            raw_course_type = "Course"
            raw_program_type = ""
        else:
            raw_title = raw.get("Title") if raw is not None else ""
            raw_description = raw.get("Short Intro") if raw is not None else ""
            raw_category = raw.get("Category") if raw is not None else ""
            raw_difficulty = raw.get("Level") if raw is not None else ""
            raw_rating = raw.get("Rating") if raw is not None else ""
            raw_provider = raw.get("Site") if raw is not None else ""
            raw_skills = raw.get("Skills") if raw is not None else ""
            raw_course_type = raw.get("Course Type") if raw is not None else ""
            raw_program_type = raw.get("Program Type") if raw is not None else ""

        title = first_nonempty(raw_title, base.get("title"))
        if not title:
            drops["missing_title"] += 1
            continue
        if clean_display(raw_title) and title != clean_display(base.get("title")):
            recovery["display_titles_restored"] += 1

        description = first_nonempty(raw_description, base.get("description"))
        if clean_display(raw_description):
            recovery["descriptions_restored"] += 1

        category = normalize_category(first_nonempty(raw_category, base.get("category")))
        difficulty = normalize_difficulty(first_nonempty(raw_difficulty, base.get("difficulty")))
        provider = normalize_provider(first_nonempty(raw_provider, base_provider))
        resource_type = normalize_resource_type(
            raw_course_type,
            raw_program_type,
            base.get("resource_type"),
        )
        skills = clean_skills(raw_skills)
        if skills:
            recovery["skills_recovered"] += 1
        # Do not reuse the merged file's mean-imputed ratings. An empty rating
        # is more honest and more useful than presenting an invented score.
        rating = parse_rating(raw_rating) if raw is not None else parse_rating(base.get("rating"))

        tag_input = normalize_for_search(" ".join([title, description, category, skills]))
        field_tags = infer_field_tags(category, tag_input)
        search_text = normalize_for_search(
            " ".join(
                [
                    title,
                    description,
                    category,
                    difficulty,
                    provider,
                    resource_type,
                    skills,
                    field_tags,
                ]
            )
        )

        records.append(
            {
                "title": title,
                "url": url,
                "description": description,
                "category": category,
                "difficulty": difficulty,
                "rating": rating,
                "provider": provider,
                "resource_type": resource_type,
                "skills": skills,
                "field_tags": field_tags,
                "search_text": search_text,
                "_metadata_score": sum(
                    bool(value)
                    for value in [description, skills, rating, category != "General", difficulty != "Unknown"]
                ),
            }
        )

    result = pd.DataFrame(records)
    if result.empty:
        raise ValueError("No usable resource rows were produced.")

    before_dedup = len(result)
    result = result.sort_values(
        ["_metadata_score", "provider", "title"],
        ascending=[False, True, True],
        kind="stable",
    ).drop_duplicates(subset=["url"], keep="first")
    drops["duplicate_url"] += before_dedup - len(result)
    result = result.drop(columns=["_metadata_score"])
    result = result.sort_values(["provider", "title", "url"], key=lambda values: values.str.casefold())
    result = result.reset_index(drop=True)[OUTPUT_COLUMNS]

    validate_dataset(result)

    summary = {
        "source_directory": str(source_dir.resolve()),
        "source_rows": {
            "final_merged_courses": int(len(merged)),
            "Online_Courses": int(len(online)),
            "udemy_courses": int(len(udemy)),
        },
        "output_rows": int(len(result)),
        "dropped_rows": dict(sorted(drops.items())),
        "metadata_recovery": dict(sorted(recovery.items())),
        "coverage": {
            "description": round(float(result["description"].ne("").mean()), 4),
            "rating": round(float(result["rating"].notna().mean()), 4),
            "skills": round(float(result["skills"].ne("").mean()), 4),
            "specific_field_tags": round(float(result["field_tags"].ne("General Studies").mean()), 4),
        },
        "max_lengths": {
            column: int(result[column].astype(str).str.len().max())
            for column in ["title", "url", "provider", "category", "skills", "field_tags"]
        },
        "providers": result["provider"].value_counts().sort_index().to_dict(),
        "categories": result["category"].value_counts().sort_index().to_dict(),
        "difficulties": result["difficulty"].value_counts().sort_index().to_dict(),
        "resource_types": result["resource_type"].value_counts().sort_index().to_dict(),
    }
    return result, summary


def validate_dataset(frame: pd.DataFrame) -> None:
    if list(frame.columns) != OUTPUT_COLUMNS:
        raise ValueError("Output columns do not match the canonical schema.")
    if frame["url"].duplicated().any():
        raise ValueError("URLs must be unique.")

    required = [
        "title",
        "url",
        "category",
        "difficulty",
        "provider",
        "resource_type",
        "field_tags",
        "search_text",
    ]
    for column in required:
        if frame[column].isna().any() or frame[column].astype(str).str.strip().eq("").any():
            raise ValueError(f"Required column contains missing values: {column}")

    invalid_difficulties = set(frame["difficulty"]) - ALLOWED_DIFFICULTIES
    if invalid_difficulties:
        raise ValueError(f"Unexpected difficulty values: {sorted(invalid_difficulties)}")
    if not frame["url"].map(normalize_url).eq(frame["url"]).all():
        raise ValueError("One or more URLs are malformed or not canonical.")
    if frame["url"].map(is_generic_homepage).any():
        raise ValueError("Generic provider homepages cannot be catalogue resources.")

    ratings = frame["rating"].dropna()
    if not ratings.between(0, 5).all():
        raise ValueError("Ratings must be between 0 and 5.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-dir",
        required=True,
        type=Path,
        help="Directory containing final_merged_courses.csv and the raw source CSV files.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data" / "resources_import_ready.csv",
        help="Destination CSV path.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    dataset, summary = build_dataset(args.source_dir)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    dataset.to_csv(args.output, index=False, encoding="utf-8", lineterminator="\n")
    summary_path = args.output.with_suffix(".summary.json")
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Created {args.output.resolve()}")
    print(f"Created {summary_path.resolve()}")
    print(f"Usable resources: {len(dataset):,}")
    print(f"Providers: {summary['providers']}")
    print(f"Coverage: {summary['coverage']}")


if __name__ == "__main__":
    main()
