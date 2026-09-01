from __future__ import annotations

import math

import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity

from .recommenders import ALGORITHM_KEYS, ALGORITHM_LABELS, ModelBundle


RATE_COLUMNS = {
    "save_rate": "has_save",
    "open_rate": "has_open",
    "more_like_this_rate": "has_more_like_this",
    "completion_rate": "has_complete",
}


def _ndcg_at_k(recommended: list[int], gains: dict[int, float], k: int) -> float:
    dcg = 0.0
    for rank, resource_id in enumerate(recommended[:k], start=1):
        gain = float(gains.get(resource_id, 0.0))
        if gain > 0:
            dcg += (2**gain - 1) / math.log2(rank + 1)

    ideal = sorted(gains.values(), reverse=True)[:k]
    idcg = sum(
        (2**float(gain) - 1) / math.log2(rank + 1)
        for rank, gain in enumerate(ideal, start=1)
    )
    return dcg / idcg if idcg > 0 else 0.0


def _intra_list_diversity(
    resource_ids: list[int],
    models: ModelBundle,
) -> float:
    indices = [
        models.resource_index[resource_id]
        for resource_id in resource_ids
        if resource_id in models.resource_index
    ]
    if len(indices) < 2:
        return 0.0
    matrix = cosine_similarity(models.resource_matrix[indices])
    values = matrix[np.triu_indices(len(indices), k=1)]
    return float(max(0.0, 1 - values.mean()))


def evaluate_recommendations(
    recommendations: dict[str, dict[int, list[int]]],
    test: pd.DataFrame,
    models: ModelBundle,
    k_values: list[int],
    bootstrap_samples: int = 500,
    random_seed: int = 42,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    test_by_user = {
        int(user_id): group.copy()
        for user_id, group in test.groupby("user_id")
    }
    per_user_rows = []

    for algorithm in ALGORITHM_KEYS:
        for user_id, ranked_ids in recommendations[algorithm].items():
            user_test = test_by_user[user_id]
            gains = {
                int(row.resource_id): float(row.gain)
                for row in user_test.itertuples(index=False)
            }
            relevant_ids = set(gains)
            action_sets = {
                metric: set(
                    user_test.loc[
                        user_test[column] == 1,
                        "resource_id",
                    ].astype(int)
                )
                for metric, column in RATE_COLUMNS.items()
            }

            for k in k_values:
                top_k = ranked_ids[:k]
                hits = len(set(top_k) & relevant_ids)
                row = {
                    "algorithm": algorithm,
                    "algorithm_label": ALGORITHM_LABELS[algorithm],
                    "user_id": int(user_id),
                    "k": int(k),
                    "precision": hits / k,
                    "recall": hits / len(relevant_ids),
                    "ndcg": _ndcg_at_k(top_k, gains, k),
                    "diversity": _intra_list_diversity(top_k, models),
                    "recommendation_count": len(top_k),
                }
                for metric, action_ids in action_sets.items():
                    row[metric] = len(set(top_k) & action_ids) / k
                per_user_rows.append(row)

    per_user = pd.DataFrame(per_user_rows)
    summary_rows = []
    rng = np.random.default_rng(random_seed)
    metric_columns = [
        "precision",
        "recall",
        "ndcg",
        "diversity",
        *RATE_COLUMNS,
    ]

    for (algorithm, k), group in per_user.groupby(["algorithm", "k"]):
        recommended_items = {
            resource_id
            for ranked_ids in recommendations[algorithm].values()
            for resource_id in ranked_ids[: int(k)]
        }
        row = {
            "algorithm": algorithm,
            "algorithm_label": ALGORITHM_LABELS[algorithm],
            "k": int(k),
            "eligible_users": int(group["user_id"].nunique()),
            "catalogue_coverage": len(recommended_items) / len(models.resource_ids),
        }
        for metric in metric_columns:
            values = group[metric].to_numpy(dtype=float)
            row[metric] = float(values.mean())
            lower, upper = _bootstrap_interval(
                values,
                bootstrap_samples,
                rng,
            )
            row[f"{metric}_ci_lower"] = lower
            row[f"{metric}_ci_upper"] = upper
        summary_rows.append(row)

    summary = pd.DataFrame(summary_rows)
    algorithm_order = {
        algorithm: index
        for index, algorithm in enumerate(ALGORITHM_KEYS)
    }
    summary["_algorithm_order"] = summary["algorithm"].map(algorithm_order)
    summary = (
        summary.sort_values(["k", "_algorithm_order"])
        .drop(columns="_algorithm_order")
        .reset_index(drop=True)
    )
    return summary, per_user


def _bootstrap_interval(
    values: np.ndarray,
    samples: int,
    rng: np.random.Generator,
) -> tuple[float, float]:
    if len(values) == 0:
        return 0.0, 0.0
    if len(values) == 1 or samples <= 0:
        value = float(values.mean())
        return value, value
    means = np.empty(samples, dtype=float)
    for index in range(samples):
        sample = rng.choice(values, size=len(values), replace=True)
        means[index] = sample.mean()
    return (
        float(np.quantile(means, 0.025)),
        float(np.quantile(means, 0.975)),
    )


def build_recommendation_rows(
    recommendations: dict[str, dict[int, list[int]]],
    test: pd.DataFrame,
    maximum_k: int,
) -> pd.DataFrame:
    test_lookup = {
        (int(row.user_id), int(row.resource_id)): row
        for row in test.itertuples(index=False)
    }
    rows = []
    for algorithm, user_lists in recommendations.items():
        for user_id, resource_ids in user_lists.items():
            for rank, resource_id in enumerate(
                resource_ids[:maximum_k],
                start=1,
            ):
                test_row = test_lookup.get((user_id, resource_id))
                rows.append(
                    {
                        "algorithm": algorithm,
                        "algorithm_label": ALGORITHM_LABELS[algorithm],
                        "user_id": user_id,
                        "rank": rank,
                        "resource_id": resource_id,
                        "is_relevant": int(test_row is not None),
                        "gain": float(test_row.gain) if test_row else 0.0,
                        "heldout_save": int(test_row.has_save) if test_row else 0,
                        "heldout_complete": (
                            int(test_row.has_complete)
                            if test_row
                            else 0
                        ),
                        "heldout_open": int(test_row.has_open) if test_row else 0,
                        "heldout_more_like_this": (
                            int(test_row.has_more_like_this)
                            if test_row
                            else 0
                        ),
                    }
                )
    return pd.DataFrame(rows)
