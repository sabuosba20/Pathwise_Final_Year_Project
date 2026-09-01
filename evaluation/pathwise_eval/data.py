from __future__ import annotations

import math
import sqlite3
from dataclasses import dataclass
from pathlib import Path

import pandas as pd


ACTION_WEIGHTS = {
    "view": 1.0,
    "open": 3.0,
    "more_like_this": 4.0,
    "save": 5.0,
    "complete": 5.0,
    "not_interested": -1.0,
}


@dataclass
class Snapshot:
    resources: pd.DataFrame
    users: pd.DataFrame
    preferences: pd.DataFrame
    events: pd.DataFrame
    pairs: pd.DataFrame
    impressions: pd.DataFrame


@dataclass
class SplitResult:
    train: pd.DataFrame
    test: pd.DataFrame
    eligible_users: list[int]
    metadata: dict


def _read_sql(connection: sqlite3.Connection, query: str) -> pd.DataFrame:
    return pd.read_sql_query(query, connection)


def _empty_events() -> pd.DataFrame:
    return pd.DataFrame(
        columns=["user_id", "resource_id", "action", "weight", "created_at"]
    )


def load_snapshot(database_path: str | Path, include_seed_users: bool = False) -> Snapshot:
    """Load a read-only snapshot from the development SQLite database."""
    database_path = Path(database_path).resolve()
    if not database_path.exists():
        raise FileNotFoundError(f"Database not found: {database_path}")

    connection = sqlite3.connect(
        f"file:{database_path.as_posix()}?mode=ro",
        uri=True,
    )
    try:
        resources = _read_sql(
            connection,
            """
            SELECT id, title, provider, description, category, difficulty,
                   rating, resource_type, skills, field_tags, search_text
            FROM resource
            ORDER BY id
            """,
        )
        users = _read_sql(
            connection,
            "SELECT id, is_seed_user, created_at FROM user ORDER BY id",
        )
        preferences = _read_sql(
            connection,
            """
            SELECT user_id, field_of_study, skills, learning_goals
            FROM preference
            """,
        )
        interactions = _read_sql(
            connection,
            """
            SELECT user_id, resource_id, interaction_type, created_at
            FROM interaction
            """,
        )
        bookmarks = _read_sql(
            connection,
            "SELECT user_id, resource_id, created_at FROM bookmark",
        )
        completions = _read_sql(
            connection,
            """
            SELECT user_id, resource_id, completed_at AS created_at
            FROM course_completion
            """,
        )
        feedback = _read_sql(
            connection,
            """
            SELECT user_id, resource_id, feedback_type,
                   COALESCE(updated_at, created_at) AS created_at
            FROM recommendation_feedback
            """,
        )
        impressions = _read_sql(
            connection,
            """
            SELECT user_id, resource_id, rank, algorithm_version, reason,
                   shown_at, opened_at, saved_at, dismissed_at,
                   more_like_this_at, completed_at
            FROM recommendation_impression
            """,
        )
    finally:
        connection.close()

    if resources.empty:
        raise ValueError("The resource catalogue is empty.")

    allowed_user_ids = set(
        users.loc[
            include_seed_users | (users["is_seed_user"] == 0),
            "id",
        ].astype(int)
    )
    users = users[users["id"].isin(allowed_user_ids)].copy()
    preferences = preferences[preferences["user_id"].isin(allowed_user_ids)].copy()

    impressions = impressions[impressions["user_id"].isin(allowed_user_ids)].copy()
    for column in [
        "shown_at",
        "opened_at",
        "saved_at",
        "dismissed_at",
        "more_like_this_at",
        "completed_at",
    ]:
        impressions[column] = pd.to_datetime(impressions[column], utc=True, errors="coerce")

    event_frames: list[pd.DataFrame] = []
    if not interactions.empty:
        interaction_events = interactions.rename(
            columns={"interaction_type": "action"}
        ).copy()
        interaction_events["action"] = interaction_events["action"].replace(
            {"outbound_click": "open"}
        )
        event_frames.append(interaction_events)

    if not bookmarks.empty:
        bookmark_events = bookmarks.copy()
        bookmark_events["action"] = "save"
        event_frames.append(bookmark_events)

    if not completions.empty:
        completion_events = completions.copy()
        completion_events["action"] = "complete"
        event_frames.append(completion_events)

    if not feedback.empty:
        feedback_events = feedback.rename(
            columns={"feedback_type": "action"}
        ).copy()
        event_frames.append(feedback_events)

    if event_frames:
        events = pd.concat(event_frames, ignore_index=True, sort=False)
        events = events[events["user_id"].isin(allowed_user_ids)].copy()
        events["weight"] = events["action"].map(ACTION_WEIGHTS)
        events = events[events["weight"].notna()].copy()
        events["user_id"] = events["user_id"].astype(int)
        events["resource_id"] = events["resource_id"].astype(int)
        events["created_at"] = pd.to_datetime(
            events["created_at"],
            utc=True,
            errors="coerce",
        )
        events = events[events["created_at"].notna()].copy()
    else:
        events = _empty_events()

    pairs = build_user_item_pairs(events)
    return Snapshot(
        resources=resources,
        users=users,
        preferences=preferences,
        events=events,
        pairs=pairs,
        impressions=impressions,
    )


def build_user_item_pairs(events: pd.DataFrame) -> pd.DataFrame:
    """Collapse repeated events to one auditable user-resource pair."""
    columns = [
        "user_id",
        "resource_id",
        "last_event_at",
        "signal_weight",
        "gain",
        "has_view",
        "has_open",
        "has_save",
        "has_complete",
        "has_more_like_this",
        "has_not_interested",
    ]
    if events.empty:
        return pd.DataFrame(columns=columns)

    work = events.copy()
    for action in ACTION_WEIGHTS:
        work[f"has_{action}"] = (work["action"] == action).astype(int)
    work["positive_weight"] = work["weight"].clip(lower=0)

    grouped = (
        work.groupby(["user_id", "resource_id"], as_index=False)
        .agg(
            last_event_at=("created_at", "max"),
            signal_weight=("positive_weight", "max"),
            has_view=("has_view", "max"),
            has_open=("has_open", "max"),
            has_save=("has_save", "max"),
            has_complete=("has_complete", "max"),
            has_more_like_this=("has_more_like_this", "max"),
            has_not_interested=("has_not_interested", "max"),
        )
        .sort_values(["user_id", "last_event_at", "resource_id"])
        .reset_index(drop=True)
    )
    grouped["gain"] = grouped["signal_weight"].where(
        grouped["has_not_interested"] == 0,
        0.0,
    )
    return grouped[columns]


def split_pairs(
    pairs: pd.DataFrame,
    strategy: str = "user_temporal",
    test_ratio: float = 0.2,
    minimum_train_relevant: int = 2,
) -> SplitResult:
    """Create a chronological split with no user-resource pair in both sides."""
    if not 0 < test_ratio < 1:
        raise ValueError("test_ratio must be between 0 and 1.")
    if minimum_train_relevant < 1:
        raise ValueError("minimum_train_relevant must be at least 1.")
    if strategy not in {"user_temporal", "global_temporal"}:
        raise ValueError("strategy must be user_temporal or global_temporal.")

    relevant = pairs[pairs["gain"] >= ACTION_WEIGHTS["open"]].copy()
    if relevant.empty:
        return SplitResult(
            train=pairs.iloc[0:0].copy(),
            test=relevant,
            eligible_users=[],
            metadata={
                "strategy": strategy,
                "testRatio": test_ratio,
                "minimumTrainRelevant": minimum_train_relevant,
            },
        )

    if strategy == "global_temporal":
        return _global_temporal_split(
            pairs,
            relevant,
            test_ratio,
            minimum_train_relevant,
        )
    return _user_temporal_split(
        pairs,
        relevant,
        test_ratio,
        minimum_train_relevant,
    )


def _user_temporal_split(
    pairs: pd.DataFrame,
    relevant: pd.DataFrame,
    test_ratio: float,
    minimum_train_relevant: int,
) -> SplitResult:
    train_parts: list[pd.DataFrame] = []
    test_parts: list[pd.DataFrame] = []
    eligible_users: list[int] = []
    cutoffs: dict[int, str] = {}

    for user_id, user_relevant in relevant.groupby("user_id"):
        ordered = user_relevant.sort_values(["last_event_at", "resource_id"])
        test_count = max(1, math.ceil(len(ordered) * test_ratio))
        if len(ordered) - test_count < minimum_train_relevant:
            continue

        user_test = ordered.tail(test_count).copy()
        first_test = user_test.iloc[0]
        first_test_key = (
            first_test["last_event_at"],
            int(first_test["resource_id"]),
        )
        user_pairs = pairs[pairs["user_id"] == user_id].copy()
        earlier_mask = user_pairs.apply(
            lambda row: (
                row["last_event_at"],
                int(row["resource_id"]),
            )
            < first_test_key,
            axis=1,
        )
        user_train = user_pairs[earlier_mask].copy()
        train_relevant_count = int(
            (user_train["gain"] >= ACTION_WEIGHTS["open"]).sum()
        )
        if train_relevant_count < minimum_train_relevant:
            continue

        eligible_users.append(int(user_id))
        train_parts.append(user_train)
        test_parts.append(user_test)
        cutoffs[int(user_id)] = first_test["last_event_at"].isoformat()

    train = (
        pd.concat(train_parts, ignore_index=True)
        if train_parts
        else pairs.iloc[0:0].copy()
    )
    test = (
        pd.concat(test_parts, ignore_index=True)
        if test_parts
        else relevant.iloc[0:0].copy()
    )
    return SplitResult(
        train=train,
        test=test,
        eligible_users=eligible_users,
        metadata={
            "strategy": "user_temporal",
            "testRatio": test_ratio,
            "minimumTrainRelevant": minimum_train_relevant,
            "userCutoffs": cutoffs,
        },
    )


def _global_temporal_split(
    pairs: pd.DataFrame,
    relevant: pd.DataFrame,
    test_ratio: float,
    minimum_train_relevant: int,
) -> SplitResult:
    cutoff = relevant["last_event_at"].quantile(1 - test_ratio)
    candidate_train = pairs[pairs["last_event_at"] < cutoff].copy()
    candidate_test = relevant[relevant["last_event_at"] >= cutoff].copy()

    eligible_users = []
    for user_id in sorted(set(candidate_train["user_id"]) & set(candidate_test["user_id"])):
        train_relevant_count = int(
            (
                candidate_train.loc[
                    candidate_train["user_id"] == user_id,
                    "gain",
                ]
                >= ACTION_WEIGHTS["open"]
            ).sum()
        )
        if train_relevant_count >= minimum_train_relevant:
            eligible_users.append(int(user_id))

    return SplitResult(
        train=candidate_train[
            candidate_train["user_id"].isin(eligible_users)
        ].copy(),
        test=candidate_test[
            candidate_test["user_id"].isin(eligible_users)
        ].copy(),
        eligible_users=eligible_users,
        metadata={
            "strategy": "global_temporal",
            "testRatio": test_ratio,
            "minimumTrainRelevant": minimum_train_relevant,
            "globalCutoff": cutoff.isoformat(),
        },
    )
