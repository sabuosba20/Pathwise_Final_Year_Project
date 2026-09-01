from __future__ import annotations

import html
import json
from pathlib import Path

import pandas as pd


PERCENT_COLUMNS = [
    "precision",
    "recall",
    "ndcg",
    "catalogue_coverage",
    "diversity",
    "save_rate",
    "open_rate",
    "more_like_this_rate",
    "completion_rate",
]


def write_outputs(
    output_dir: str | Path,
    result: dict,
    summary: pd.DataFrame,
    per_user: pd.DataFrame,
    recommendation_rows: pd.DataFrame,
) -> dict[str, Path]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    json_path = output_dir / "evaluation.json"
    summary_path = output_dir / "summary.csv"
    per_user_path = output_dir / "per_user_metrics.csv"
    recommendations_path = output_dir / "recommendations.csv"
    report_path = output_dir / "report.html"

    json_path.write_text(
        json.dumps(result, indent=2, default=str),
        encoding="utf-8",
    )
    summary.to_csv(summary_path, index=False)
    per_user.to_csv(per_user_path, index=False)
    recommendation_rows.to_csv(recommendations_path, index=False)
    report_path.write_text(
        build_html_report(result, summary),
        encoding="utf-8",
    )
    return {
        "json": json_path,
        "summary": summary_path,
        "perUser": per_user_path,
        "recommendations": recommendations_path,
        "report": report_path,
    }


def _percent(value: float) -> str:
    return f"{100 * float(value):.2f}%"


def build_html_report(result: dict, summary: pd.DataFrame) -> str:
    warnings = result["dataQuality"]["warnings"]
    warning_items = "".join(
        f"<li>{html.escape(warning)}</li>"
        for warning in warnings
    ) or "<li>No material warnings were generated.</li>"

    table_rows = []
    for row in summary.itertuples(index=False):
        cells = [
            html.escape(row.algorithm_label),
            str(row.k),
            _percent(row.precision),
            _percent(row.recall),
            _percent(row.ndcg),
            _percent(row.catalogue_coverage),
            _percent(row.diversity),
            _percent(row.save_rate),
            _percent(row.open_rate),
            _percent(row.more_like_this_rate),
            _percent(row.completion_rate),
        ]
        table_rows.append(
            "<tr>"
            + "".join(f"<td>{cell}</td>" for cell in cells)
            + "</tr>"
        )

    metadata = result["metadata"]
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pathwise Recommendation Evaluation</title>
  <style>
    :root {{ color-scheme: light; font-family: Inter, Arial, sans-serif; }}
    body {{ margin: 0; background: #f7f5f2; color: #1c1917; }}
    main {{ width: min(1180px, calc(100% - 32px)); margin: 40px auto; }}
    header, section {{ background: white; border: 1px solid #e7e5e4; border-radius: 16px; padding: 24px; margin-bottom: 20px; }}
    h1, h2 {{ margin-top: 0; }}
    .meta {{ display: flex; flex-wrap: wrap; gap: 10px; }}
    .meta span {{ background: #f5e5dd; border-radius: 999px; padding: 8px 12px; font-weight: 700; }}
    .warning {{ border-color: #fdba74; background: #fff7ed; }}
    .table-wrap {{ overflow-x: auto; }}
    table {{ width: 100%; min-width: 1080px; border-collapse: collapse; font-size: 14px; }}
    th, td {{ padding: 12px 10px; border-bottom: 1px solid #e7e5e4; text-align: right; white-space: nowrap; }}
    th:first-child, td:first-child {{ text-align: left; }}
    th {{ background: #292524; color: white; }}
    p, li {{ line-height: 1.65; }}
    code {{ background: #f5f5f4; padding: 2px 5px; border-radius: 5px; }}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Pathwise Recommendation Evaluation</h1>
    <p>Leakage-controlled offline comparison of five recommendation approaches.</p>
    <div class="meta">
      <span>{metadata["eligibleUsers"]} eligible users</span>
      <span>{metadata["catalogueSize"]} courses</span>
      <span>{html.escape(metadata["splitStrategy"])}</span>
      <span>Seed users: {str(metadata["includedSeedUsers"]).lower()}</span>
    </div>
  </header>
  <section>
    <h2>Results</h2>
    <p>User-level 95% bootstrap confidence intervals are preserved in <code>summary.csv</code>.</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Approach</th><th>K</th><th>Precision</th><th>Recall</th>
            <th>NDCG</th><th>Coverage</th><th>Diversity</th>
            <th>Save hit rate</th><th>Open hit rate</th><th>More-like hit rate</th>
            <th>Completion hit rate</th>
          </tr>
        </thead>
        <tbody>{''.join(table_rows)}</tbody>
      </table>
    </div>
  </section>
  <section class="warning">
    <h2>Data-quality and interpretation warnings</h2>
    <ul>{warning_items}</ul>
  </section>
  <section>
    <h2>Rate interpretation</h2>
    <p>The save, open, More-like-this, and completion values above are <strong>offline held-out action-hit rates</strong>:
    matching held-out actions divided by the number of recommended slots. They are not live product conversion
    rates. True online rates require recommendation-run and impression instrumentation so every action has an
    exposure denominator and source attribution.</p>
  </section>
</main>
</body>
</html>
"""
