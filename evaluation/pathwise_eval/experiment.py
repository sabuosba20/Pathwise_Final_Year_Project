from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from .data import ACTION_WEIGHTS, load_snapshot, split_pairs
from .metrics import (
    build_recommendation_rows,
    evaluate_recommendations,
)
from .recommenders import build_models, recommend_for_users
from .report import write_outputs


@dataclass
class EvaluationConfig:
    database_path: Path
    output_dir: Path
    k_values: tuple[int, ...] = (5, 10)
    split_strategy: str = "user_temporal"
    test_ratio: float = 0.2
    minimum_train_relevant: int = 2
    include_seed_users: bool = False
    bootstrap_samples: int = 500
    random_seed: int = 42


def run_evaluation(config: EvaluationConfig) -> dict:
    k_values = sorted(set(int(k) for k in config.k_values))
    if not k_values or min(k_values) < 1:
        raise ValueError("At least one positive K value is required.")

    snapshot = load_snapshot(
        config.database_path,
        include_seed_users=config.include_seed_users,
    )
    split = split_pairs(
        snapshot.pairs,
        strategy=config.split_strategy,
        test_ratio=config.test_ratio,
        minimum_train_relevant=config.minimum_train_relevant,
    )
    if not split.eligible_users:
        raise ValueError(
            "No users are eligible for evaluation. Collect more real user "
            "opens/saves, lower --minimum-train-relevant for a diagnostic run, "
            "or use --include-seed-users for a clearly labelled demo."
        )

    eligible_preferences = snapshot.preferences[
        snapshot.preferences["user_id"].isin(split.eligible_users)
    ].copy()
    models = build_models(
        snapshot.resources,
        eligible_preferences,
        split.train,
        random_seed=config.random_seed,
    )
    maximum_k = max(k_values)
    recommendations, diagnostics = recommend_for_users(
        models,
        split.eligible_users,
        maximum_k,
    )
    summary, per_user = evaluate_recommendations(
        recommendations,
        split.test,
        models,
        k_values,
        bootstrap_samples=config.bootstrap_samples,
        random_seed=config.random_seed,
    )
    recommendation_rows = build_recommendation_rows(
        recommendations,
        split.test,
        maximum_k,
    )

    leakage = _leakage_checks(
        split.train,
        split.test,
        recommendation_rows,
    )
    data_quality = _data_quality(
        snapshot,
        split,
        config,
        leakage,
    )
    result = {
        "metadata": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "databasePath": str(config.database_path.resolve()),
            "catalogueSize": int(len(snapshot.resources)),
            "userCount": int(len(snapshot.users)),
            "eligibleUsers": int(len(split.eligible_users)),
            "includedSeedUsers": bool(config.include_seed_users),
            "splitStrategy": config.split_strategy,
            "testRatio": config.test_ratio,
            "minimumTrainRelevant": config.minimum_train_relevant,
            "kValues": k_values,
            "bootstrapSamples": config.bootstrap_samples,
            "randomSeed": config.random_seed,
            "relevanceThreshold": ACTION_WEIGHTS["open"],
        },
        "split": split.metadata,
        "modelDiagnostics": diagnostics,
        "dataQuality": data_quality,
        "summary": summary.to_dict(orient="records"),
    }
    paths = write_outputs(
        config.output_dir,
        result,
        summary,
        per_user,
        recommendation_rows,
    )
    result["outputPaths"] = {
        key: str(path.resolve())
        for key, path in paths.items()
    }
    return result


def _leakage_checks(
    train: pd.DataFrame,
    test: pd.DataFrame,
    recommendation_rows: pd.DataFrame,
) -> dict:
    train_pairs = set(
        zip(
            train["user_id"].astype(int),
            train["resource_id"].astype(int),
        )
    )
    test_pairs = set(
        zip(
            test["user_id"].astype(int),
            test["resource_id"].astype(int),
        )
    )
    overlap = train_pairs & test_pairs
    recommended_seen = 0
    for row in recommendation_rows.itertuples(index=False):
        if (int(row.user_id), int(row.resource_id)) in train_pairs:
            recommended_seen += 1

    chronological_violations = 0
    for user_id in sorted(set(test["user_id"])):
        user_train = train[train["user_id"] == user_id]
        user_test = test[test["user_id"] == user_id]
        if user_train.empty or user_test.empty:
            continue
        latest_train_key = max(
            zip(
                user_train["last_event_at"],
                user_train["resource_id"].astype(int),
            )
        )
        earliest_test_key = min(
            zip(
                user_test["last_event_at"],
                user_test["resource_id"].astype(int),
            )
        )
        if latest_train_key >= earliest_test_key:
            chronological_violations += 1

    return {
        "trainTestPairOverlap": len(overlap),
        "recommendedSeenItems": recommended_seen,
        "chronologicalUserViolations": chronological_violations,
        "passed": (
            len(overlap) == 0
            and recommended_seen == 0
            and chronological_violations == 0
        ),
    }


def _data_quality(snapshot, split, config, leakage) -> dict:
    event_counts = (
        snapshot.events["action"].value_counts().sort_index().to_dict()
        if not snapshot.events.empty
        else {}
    )
    event_counts = {
        str(key): int(value)
        for key, value in event_counts.items()
    }
    seed_user_count = int(snapshot.users["is_seed_user"].sum())
    relevant_pairs = snapshot.pairs[
        snapshot.pairs["gain"] >= ACTION_WEIGHTS["open"]
    ]
    warnings = []

    if config.include_seed_users and seed_user_count:
        warnings.append(
            "This run includes synthetic seed users. It demonstrates the "
            "pipeline but must not be presented as real-user effectiveness."
        )
    if len(split.eligible_users) < 30:
        warnings.append(
            "Fewer than 30 users are eligible; confidence intervals and "
            "algorithm differences are likely unstable."
        )
    more_like_count = event_counts.get("more_like_this", 0)
    if more_like_count < 20:
        warnings.append(
            "There are too few More-like-this events to evaluate the feedback "
            "variant reliably."
        )
    completion_count = event_counts.get("complete", 0)
    if completion_count < 20:
        warnings.append(
            "There are too few self-reported course completions to evaluate "
            "completion-based learning signals reliably."
        )
    if not snapshot.events.empty:
        span = (
            snapshot.events["created_at"].max()
            - snapshot.events["created_at"].min()
        )
        if span.days < 14:
            warnings.append(
                "The event history covers less than 14 days, so the holdout "
                "does not represent long-term learning behaviour."
            )
        tied_user_timestamps = (
            snapshot.events.groupby(["user_id", "created_at"])
            .size()
            .gt(1)
            .sum()
        )
        if tied_user_timestamps:
            warnings.append(
                "Some user events share identical timestamps. The per-user "
                "split resolves ties deterministically by resource ID; treat "
                "runs dominated by tied synthetic events as pipeline demos, "
                "not longitudinal evidence."
            )
    warnings.append(
        "Preferences have no historical timestamp/version, so the evaluator "
        "uses the current profile snapshot for both train and test periods."
    )
    warnings.append(
        "Save/open/More-like-this/completion rates are offline held-out "
        "action-hit rates. True online rates require impression-level outcome "
        "attribution; Pathwise records these outcomes for deployed recommendations."
    )
    if not leakage["passed"]:
        warnings.append(
            "A leakage check failed. Do not use this run in the thesis until "
            "the split or candidate logic is corrected."
        )

    return {
        "eventCounts": event_counts,
        "pairCount": int(len(snapshot.pairs)),
        "relevantPairCount": int(len(relevant_pairs)),
        "trainPairCount": int(len(split.train)),
        "testPairCount": int(len(split.test)),
        "seedUserCount": seed_user_count,
        "leakageChecks": leakage,
        "warnings": warnings,
    }
