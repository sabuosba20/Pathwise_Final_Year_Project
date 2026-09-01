from __future__ import annotations

import unittest

from pathwise_eval.metrics import _ndcg_at_k


class MetricsTestCase(unittest.TestCase):
    def test_ndcg_is_one_for_ideal_ranking(self):
        gains = {10: 5.0, 20: 3.0}
        self.assertAlmostEqual(
            _ndcg_at_k([10, 20, 30], gains, 3),
            1.0,
        )

    def test_ndcg_penalizes_late_relevant_results(self):
        gains = {10: 5.0}
        top = _ndcg_at_k([10, 20, 30], gains, 3)
        late = _ndcg_at_k([20, 30, 10], gains, 3)
        self.assertGreater(top, late)
        self.assertGreater(late, 0)

    def test_ndcg_is_zero_when_nothing_relevant_is_recommended(self):
        self.assertEqual(
            _ndcg_at_k([20, 30], {10: 5.0}, 2),
            0.0,
        )


if __name__ == "__main__":
    unittest.main()

