from __future__ import annotations

import unittest

import pandas as pd

from pathwise_eval.data import build_user_item_pairs, split_pairs


class TemporalSplitTestCase(unittest.TestCase):
    def test_not_interested_overrides_pair_relevance(self):
        events = pd.DataFrame(
            [
                {
                    "user_id": 1,
                    "resource_id": 10,
                    "action": "open",
                    "weight": 3.0,
                    "created_at": pd.Timestamp("2026-01-01", tz="UTC"),
                },
                {
                    "user_id": 1,
                    "resource_id": 10,
                    "action": "not_interested",
                    "weight": -1.0,
                    "created_at": pd.Timestamp("2026-01-02", tz="UTC"),
                },
            ]
        )

        pair = build_user_item_pairs(events).iloc[0]

        self.assertEqual(pair["gain"], 0.0)
        self.assertEqual(pair["has_open"], 1)
        self.assertEqual(pair["has_not_interested"], 1)

    def test_user_temporal_split_has_no_pair_or_time_leakage(self):
        rows = []
        for user_id in [1, 2]:
            for index in range(5):
                rows.append(
                    {
                        "user_id": user_id,
                        "resource_id": user_id * 100 + index,
                        "last_event_at": pd.Timestamp(
                            f"2026-01-{index + 1:02d}",
                            tz="UTC",
                        ),
                        "signal_weight": 3.0,
                        "gain": 3.0,
                        "has_view": 0,
                        "has_open": 1,
                        "has_save": 0,
                        "has_complete": 0,
                        "has_more_like_this": 0,
                        "has_not_interested": 0,
                    }
                )
        pairs = pd.DataFrame(rows)

        split = split_pairs(
            pairs,
            strategy="user_temporal",
            test_ratio=0.2,
            minimum_train_relevant=2,
        )

        train_pairs = set(zip(split.train.user_id, split.train.resource_id))
        test_pairs = set(zip(split.test.user_id, split.test.resource_id))
        self.assertFalse(train_pairs & test_pairs)
        self.assertEqual(split.eligible_users, [1, 2])
        for user_id in split.eligible_users:
            train_max = split.train.loc[
                split.train.user_id == user_id,
                "last_event_at",
            ].max()
            test_min = split.test.loc[
                split.test.user_id == user_id,
                "last_event_at",
            ].min()
            self.assertLess(train_max, test_min)

    def test_completion_is_a_strong_auditable_signal(self):
        events = pd.DataFrame(
            [
                {
                    "user_id": 1,
                    "resource_id": 10,
                    "action": "complete",
                    "weight": 5.0,
                    "created_at": pd.Timestamp("2026-01-03", tz="UTC"),
                }
            ]
        )

        pair = build_user_item_pairs(events).iloc[0]

        self.assertEqual(pair["gain"], 5.0)
        self.assertEqual(pair["has_complete"], 1)


if __name__ == "__main__":
    unittest.main()
