from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pathwise_eval import EvaluationConfig, run_evaluation


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the isolated Pathwise recommender evaluation.",
    )
    parser.add_argument(
        "--database",
        type=Path,
        default=Path("backend/instance/pathwise.db"),
        help="Path to the Pathwise SQLite database.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("evaluation/outputs/latest"),
        help="Directory for CSV, JSON, and HTML outputs.",
    )
    parser.add_argument(
        "--k",
        type=int,
        nargs="+",
        default=[5, 10],
        help="One or more K values, for example --k 5 10.",
    )
    parser.add_argument(
        "--split-strategy",
        choices=["user_temporal", "global_temporal"],
        default="user_temporal",
    )
    parser.add_argument("--test-ratio", type=float, default=0.2)
    parser.add_argument("--minimum-train-relevant", type=int, default=2)
    parser.add_argument(
        "--include-seed-users",
        action="store_true",
        help="Include synthetic seed users for a demo-only run.",
    )
    parser.add_argument("--bootstrap-samples", type=int, default=500)
    parser.add_argument("--random-seed", type=int, default=42)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = EvaluationConfig(
        database_path=args.database,
        output_dir=args.output_dir,
        k_values=tuple(args.k),
        split_strategy=args.split_strategy,
        test_ratio=args.test_ratio,
        minimum_train_relevant=args.minimum_train_relevant,
        include_seed_users=args.include_seed_users,
        bootstrap_samples=args.bootstrap_samples,
        random_seed=args.random_seed,
    )
    try:
        result = run_evaluation(config)
    except (FileNotFoundError, RuntimeError, ValueError) as error:
        print(f"Evaluation failed: {error}", file=sys.stderr)
        return 1

    print("Pathwise evaluation complete.")
    print(f"Eligible users: {result['metadata']['eligibleUsers']}")
    print(
        "Leakage checks passed: "
        f"{result['dataQuality']['leakageChecks']['passed']}"
    )
    for label, path in result["outputPaths"].items():
        print(f"{label}: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

