# Pathwise FYP Recommendation Evaluation

This folder is intentionally isolated from the Flask API and React frontend.
Deleting `evaluation/` removes the evaluator and its generated outputs without
changing the Pathwise application.

## Submission database note

The `outputs/ch5-final` directory preserves the archived evaluation run used
for the Chapter 5 results. Before submission, the bundled
`backend/instance/pathwise.db` database was cleaned to remove older development
and unnecessary test records and to provide a smaller demonstration copy. The
submitted database is therefore not identical to the snapshot used for the
archived evaluation, so rerunning the evaluator may produce different user
counts, event counts, and metric values.

## What it compares

The evaluator runs five controlled variants:

1. **Popular courses baseline** - ranks courses by weighted popularity in the
   training period.
2. **Content-based only** - uses the student's degree, skills, and learning
   goals with TF-IDF cosine similarity.
3. **Collaborative filtering only** - uses Surprise SVD trained only on
   training-period implicit ratings.
4. **Hybrid recommendation** - adaptively combines profile content and
   collaborative scores.
5. **Hybrid with saved courses and feedback** - adds saved-course and
   More-like-this content seeds, applies positive/negative feedback adjustments,
   excludes previously seen items, and applies the deployed diversity reranker.

## Methodology

- The default split is **per-user chronological holdout**. The final 20% of
  each eligible user's strong actions are held out. Every training action for
  that user must precede the first held-out action. Identical timestamps are
  resolved deterministically by resource ID and reported as a data-quality
  warning.
- A strong/relevant action is an external course open (gain 3),
  More-like-this (gain 4), save (gain 5), or self-reported completion (gain 5).
  A simple view is a weak training
  signal but is not sufficient by itself to define test relevance.
- No user-resource pair may appear in both train and test.
- Previously seen training items are excluded from every algorithm's candidate
  list.
- Bootstrap 95% confidence intervals are generated for user-averaged metrics.
- `global_temporal` is available as a stricter alternative when the dataset is
  large and spans enough time.

## Metrics

- **Precision@K:** relevant held-out items in the top K divided by K.
- **Recall@K:** relevant held-out items in the top K divided by all relevant
  held-out items for that user.
- **NDCG@K:** rank-sensitive, graded relevance using the action gains above.
- **Catalogue coverage:** distinct recommended courses divided by all courses.
- **Recommendation diversity:** one minus average pairwise TF-IDF cosine
  similarity within each recommendation list.
- **Save/open/More-like-this/completion hit rate@K:** held-out actions matched by the top K
  divided by the number of recommendation slots.

The action rates are offline proxies, not live conversion rates. Real online
rates require recommendation impressions, run IDs, ranks, and source
attribution so actions have a valid exposure denominator.

## Run

From the repository root, using the backend environment:

```powershell
backend\.venv\Scripts\python.exe evaluation\run_evaluation.py
```

The default excludes synthetic seed users. If there are not yet enough real
users, run a clearly labelled demonstration:

```powershell
backend\.venv\Scripts\python.exe evaluation\run_evaluation.py `
  --include-seed-users `
  --output-dir evaluation\outputs\demo
```

Outputs:

- `report.html` - reader-friendly result table and warnings
- `summary.csv` - algorithm-level metrics at each K
- `per_user_metrics.csv` - audit-ready user-level calculations
- `recommendations.csv` - every evaluated recommendation and held-out hit
- `evaluation.json` - configuration, diagnostics, warnings, and results

## Tests

```powershell
$env:PYTHONPATH = "evaluation"
backend\.venv\Scripts\python.exe -m unittest discover -s evaluation\tests -v
```

## Academic caveats

- Synthetic seed users are suitable for checking that the pipeline works, but
  not for claiming recommendation accuracy.
- The current database stores only the latest learning profile, without profile
  history. The evaluator therefore uses the current profile snapshot.
- More-like-this conclusions require substantially more feedback events than
  the current development database contains.
- Report the user count, event date range, split strategy, K, confidence
  intervals, and whether seed users were included alongside every result table.
