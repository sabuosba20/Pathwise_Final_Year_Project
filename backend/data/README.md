# Pathwise resource dataset

`resources_import_ready.csv` is the canonical course catalogue used for the
resource API and recommendation engine. It is generated rather than edited by
hand.

From the project root, rebuild it with:

```powershell
backend\.venv\Scripts\python.exe backend\scripts\build_resources_dataset.py `
  --source-dir "C:\path\to\datasets"
```

The builder starts with `final_merged_courses.csv`, removes rows that cannot
open a specific course page, and restores display metadata from
`Online_Courses.csv` and `udemy_courses.csv` using the course URL as the key.
It also creates normalized categories, difficulty values, broad academic field
tags, and `search_text` for TF-IDF.

The adjacent `resources_import_ready.summary.json` records row counts, removal
reasons, metadata coverage, and distributions so each rebuild can be checked.

Import the generated catalogue from the `backend` directory:

```powershell
python -m flask --app run import-resources
```

The URL is the stable identifier, so rerunning the command creates new rows,
updates changed metadata, and reports unchanged rows without producing
duplicates. Add `--dry-run` to validate and compare without committing resource
rows, or `--file C:\path\to\another.csv` to use a different canonical file.

Important limitations:

- Udemy source rows do not include descriptions, skills, or ratings. Their
  recommendation text therefore relies on title, category, difficulty, and
  inferred field tags.
- `field_tags` are deterministic keyword/category mappings. They support the
  first content-based version and can be refined later without introducing an
  LLM or vector database.
