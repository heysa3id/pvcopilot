"""
Tests for datafiltering module: pvwatts_filter with and without time-of-day weight.
"""
from __future__ import annotations

import unittest
from datetime import datetime

import numpy as np
import pandas as pd

# Import from parent
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from datafiltering import pvwatts_filter, _time_of_day_weight


class TestTimeOfDayWeight(unittest.TestCase):
    """Test _time_of_day_weight formula."""

    def test_noon_is_one(self):
        hour = np.array([12.0])
        w = _time_of_day_weight(hour, solar_noon=12.0, min_weight=0.2)
        self.assertAlmostEqual(w[0], 1.0, places=5)

    def test_six_and_eighteen_are_min_weight(self):
        hour = np.array([6.0, 18.0])
        w = _time_of_day_weight(hour, solar_noon=12.0, min_weight=0.2)
        self.assertAlmostEqual(w[0], 0.2, places=5)
        self.assertAlmostEqual(w[1], 0.2, places=5)

    def test_morning_between_min_and_one(self):
        hour = np.array([9.0])  # 9am: between 6 and 12
        w = _time_of_day_weight(hour, solar_noon=12.0, min_weight=0.2)
        self.assertGreater(w[0], 0.2)
        self.assertLess(w[0], 1.0)


class TestPvwattsFilter(unittest.TestCase):
    """Test pvwatts_filter with and without time_weight_min."""

    def _make_df(self, times, p_dc, pvwatts):
        return pd.DataFrame({"time": times, "P_DC": p_dc, "PVWatts": pvwatts})

    def test_no_time_weight_same_as_before(self):
        # One row: rel_error = 0.3, threshold 0.5 -> valid
        df = self._make_df(
            [datetime(2024, 9, 15, 12, 0, 0)],
            [100.0],
            [100.0 / 1.3],  # P_DC=100, PVWatts=100/1.3 => rel_error = 0.3
        )
        labeled, filtered, removed = pvwatts_filter(df, threshold=0.5, resample_interval=None)
        self.assertEqual(len(labeled), 1)
        self.assertEqual(labeled["status"].iloc[0], "valid")
        self.assertEqual(len(removed), 0)

    def test_no_time_weight_removed_when_above_threshold(self):
        # rel_error = 0.6, threshold 0.5 -> removed
        df = self._make_df(
            [datetime(2024, 9, 15, 12, 0, 0)],
            [100.0],
            [100.0 / 1.6],  # rel_error = 0.6
        )
        labeled, filtered, removed = pvwatts_filter(df, threshold=0.5, resample_interval=None)
        self.assertEqual(len(labeled), 1)
        self.assertEqual(labeled["status"].iloc[0], "removed")
        self.assertEqual(len(removed), 1)

    def test_time_weight_keeps_dawn_point_that_would_be_removed(self):
        # At noon: rel_error 0.4, threshold 0.2 -> without weight: removed.
        # At 6am: scaled_error = 0.4 * 0.2 = 0.08 <= 0.2 -> valid with weight.
        df = self._make_df(
            [datetime(2024, 9, 15, 6, 0, 0)],   # 6am
            [100.0],
            [100.0 / 1.4],  # rel_error = 0.4
        )
        labeled_no_weight, _, removed_no = pvwatts_filter(
            df, threshold=0.2, resample_interval=None
        )
        labeled_with_weight, _, removed_with = pvwatts_filter(
            df, threshold=0.2, resample_interval=None, time_weight_min=0.2
        )
        self.assertEqual(labeled_no_weight["status"].iloc[0], "removed")
        self.assertEqual(len(removed_no), 1)
        self.assertEqual(labeled_with_weight["status"].iloc[0], "valid")
        self.assertEqual(len(removed_with), 0)

    def test_time_weight_noon_unchanged(self):
        # At noon weight=1, so same as no weight: rel_error 0.4, threshold 0.2 -> removed either way
        df = self._make_df(
            [datetime(2024, 9, 15, 12, 0, 0)],
            [100.0],
            [100.0 / 1.4],  # rel_error = 0.4
        )
        _, _, removed_no = pvwatts_filter(df, threshold=0.2, resample_interval=None)
        _, _, removed_with = pvwatts_filter(
            df, threshold=0.2, resample_interval=None, time_weight_min=0.2
        )
        self.assertEqual(len(removed_no), 1)
        self.assertEqual(len(removed_with), 1)

    def test_mixed_times_more_valid_at_edges_with_weight(self):
        # Noon: rel_error 0.4 -> removed. 7am and 17:00: same rel_error, with weight scaled down -> valid
        df = self._make_df(
            [
                datetime(2024, 9, 15, 7, 0, 0),
                datetime(2024, 9, 15, 12, 0, 0),
                datetime(2024, 9, 15, 17, 0, 0),
            ],
            [100.0, 100.0, 100.0],
            [100.0 / 1.4, 100.0 / 1.4, 100.0 / 1.4],  # rel_error 0.4 everywhere
        )
        _, _, removed_no = pvwatts_filter(df, threshold=0.2, resample_interval=None)
        labeled_with, _, removed_with = pvwatts_filter(
            df, threshold=0.2, resample_interval=None, time_weight_min=0.2
        )
        self.assertEqual(len(removed_no), 3)  # all removed without weight
        self.assertEqual(len(removed_with), 1)  # only noon removed with weight
        self.assertEqual(
            labeled_with[labeled_with["status"] == "valid"]["time"].dt.hour.tolist(),
            [7, 17],
        )


if __name__ == "__main__":
    unittest.main()
