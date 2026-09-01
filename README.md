# Pathwise

Pathwise is a web-based personalised course recommendation system for university students. The development stack is Flask, SQLAlchemy, JWT authentication, React, Vite, and Tailwind CSS v4.

This copy ships with a pre-built, pre-seeded database (`backend/instance/pathwise.db`) — no import or seed steps needed, just install dependencies and start both servers below.

## Quick start

Two terminals: start the backend first, then the frontend.

### 0. Get the code

**Clone:**

```bat
git clone https://github.com/sabuosba20/Pathwise_Final_Year_Project.git
cd Pathwise_Final_Year_Project
```

**Or download the ZIP:** on the [repository page](https://github.com/sabuosba20/Pathwise_Final_Year_Project), click **Code → Download ZIP**, extract it, then open a terminal in the extracted folder.

Prerequisites: [Python 3.11 or 3.12](https://www.python.org/downloads/) and [Node.js 18+](https://nodejs.org/) must both be installed and on your `PATH` (check with `python --version` and `node --version`) before continuing.

**Windows only — if `pip install` later fails with `ImportError: DLL load
failed... The filename or extension is too long`**, the extracted project is
buried too deep in your folder structure — commonly because a ZIP got
extracted inside a folder already sharing its name (Windows Explorer's
"Extract All" creates a folder named after the ZIP, so extracting a ZIP
whose own root folder has the same name doubles it up), pushing paths past
Windows' 260-character limit. Move the project to a short path like
`C:\Pathwise\` and re-run the steps below from there. macOS and Linux don't
have this path-length limit.

### 1. Backend

**Command Prompt (cmd.exe):**

```bat
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

**PowerShell:**

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py
```

`Activate.ps1` is PowerShell-only — running it in Command Prompt fails
silently instead of raising an error you'd notice, which leaves the venv
unactivated (so `pip install`/`python run.py` quietly fall back to your
global Python). Check your prompt title or run `echo %COMSPEC%` vs
`$PSVersionTable` if you're not sure which shell you're in.

**macOS / Linux (bash or zsh):**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

Use `python3` to create the venv (plain `python` may not exist or may point
to Python 2 on macOS), but once the venv is activated its own `python`
correctly points at the venv's Python 3 interpreter — no need for `python3`
after that. If `python3` isn't found at all, install it from
[python.org](https://www.python.org/downloads/) or via `brew install python`.

A `.env` file isn't required — the app falls back to sane development
defaults (SQLite database, a generated secret key) without one. Copy
`.env.example` to `.env` only if you want to customize settings like the
JWT token lifetime or rate-limit storage.

Runs at `http://127.0.0.1:5000`. Python 3.11 or 3.12 is recommended — the
optional `scikit-surprise` collaborative-filtering dependency is skipped on
Python 3.13+ because the pinned release doesn't build cleanly there.

### 2. Frontend (open a second terminal)

```powershell
cd frontend
npm install
npm run dev
```

Visit `http://127.0.0.1:5173`. Vite proxies `/api` requests to
`http://127.0.0.1:5000` by default — the literal IP is used instead of
`localhost` because Windows can resolve `localhost` to the IPv6 loopback
(`::1`), which Flask's dev server doesn't listen on, causing proxy errors.
If port 5000 is already taken on your machine, copy `frontend/.env.example`
to `frontend/.env` and change `VITE_API_PROXY_TARGET` to the backend address
you used instead.

### Demo logins

Sign in from the Login page's "Try a demo account" option, or use these
directly — each is pre-populated with a realistic learning profile,
bookmarks, ratings, and a goal:

- `cs-demo@pathwise.dev` / `demo1234`
- `business-demo@pathwise.dev` / `demo1234`

## Project structure

```text
pathwise/
  backend/    Flask API, database models, and auth/preferences routes
  frontend/   React application and public/protected routes
```

## Reference

### Resource catalogue API

```text
GET /api/resources
GET /api/resources/<id>
POST /api/bookmarks/<resource_id>
DELETE /api/bookmarks/<resource_id>
POST /api/interactions
POST /api/resources/<id>/completion
DELETE /api/resources/<id>/completion
PUT /api/resources/<id>/rating
DELETE /api/resources/<id>/rating
```

The list endpoint supports `q`, `provider`, `category`, `difficulty`,
`resource_type`, `bookmarked`, `completed`, `sort`, `page`, and `per_page` query parameters.
Use `bookmarked=true` for the signed-in student's saved catalogue. Pagination
is limited to 24 records per request. Use `completed=true&sort=completed` for
the signed-in student's completion history. Each resource response includes
the current user's saved and self-reported completion state.

The interaction endpoint accepts a resource ID and one controlled event type:
`view` when the student expands course details, or `outbound_click` when they
open the provider page. Bookmarks provide explicit preference data while these
events provide timestamped implicit feedback for the later collaborative
filtering and evaluation stages.

Course completion is self-reported because Pathwise links to external course
providers and cannot verify their provider-side progress. Completion is
reversible, excludes the finished course from future recommendations, and
acts as a strong positive seed for related next-course suggestions unless the
student rated the completed course 1 or 2 stars. Recommendation impressions
also record completion outcomes for later evaluation.

SQLite foreign-key enforcement is enabled automatically for every application
connection, protecting the database from orphaned bookmarks, interactions,
ratings, completions, feedback, impressions, and preferences while remaining
compatible with SQLAlchemy's application-level relationship cascades.

### Re-importing the catalogue

Not needed in this copy — the catalogue is already imported. If you ever
replace `backend/data/resources_import_ready.csv`, re-run:

```powershell
python -m flask --app run import-resources
```

This is repeatable: resources are created or updated by URL, while existing
users, preferences, bookmarks, and interactions are preserved. Use
`python -m flask --app run import-resources --dry-run` to preview the counts
without changing catalogue rows.

### Run backend tests

From the `backend` directory:

```powershell
python -m unittest discover -s tests -v
```

Covers authentication, search and filter combinations, sorting, pagination,
invalid parameters, individual resource responses, per-user bookmark
isolation, idempotent bookmark operations, interaction event validation,
ratings, course-completion isolation and undo, recommendation impressions,
and recommendation-signal consistency.

### Rebuild the course catalogue from source

The validated catalogue is stored at `backend/data/resources_import_ready.csv`.
To rebuild it from the source CSV files:

**Windows (PowerShell):**

```powershell
backend\.venv\Scripts\python.exe backend\scripts\build_resources_dataset.py `
  --source-dir "C:\path\to\datasets"
```

**macOS / Linux:**

```bash
backend/.venv/bin/python backend/scripts/build_resources_dataset.py \
  --source-dir "/path/to/datasets"
```

The builder restores readable source titles and descriptions, removes missing
or generic URLs, normalizes catalogue fields, and generates academic field tags
plus TF-IDF-ready search text. See `backend/data/README.md` and the generated
summary JSON for data-quality details.

Tailwind CSS v4 is configured through `@tailwindcss/vite` in `vite.config.js`; this project does not use the old PostCSS or `tailwind.config.js` setup.
