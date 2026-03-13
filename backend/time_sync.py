"""
Time synchronization utility for PV / Weather alignment.
Date ranges and shifts can be managed on the frontend; this module
provides apply_time_sync for server-side use when needed.
"""

from datetime import datetime, timedelta
import pandas as pd

# Placeholder rules: (start_datetime, end_datetime, timedelta_shift)
# Example: (datetime(2018, 3, 25), datetime(2018, 5, 16, 23, 59), timedelta(hours=1))
SYNC_RULES = []


def apply_time_sync(df: pd.DataFrame, time_col: str = "time", rules=None) -> pd.DataFrame:
    """
    Apply pre-defined time shift rules to a DataFrame.

    Parameters
    ----------
    df : pd.DataFrame
        Input DataFrame containing a time column.
    time_col : str, default 'time'
        Name of the time column to adjust.
    rules : sequence of (start_dt, end_dt, timedelta), optional
        Rules describing how much to shift timestamps within a given window.
        Defaults to SYNC_RULES.
    """
    if rules is None:
        rules = SYNC_RULES

    if time_col not in df.columns:
        return df

    times = pd.to_datetime(df[time_col], errors="coerce")

    def sync_time(ts: pd.Timestamp):
        if pd.isna(ts):
            return ts
        for start, end, shift in rules:
            if start <= ts.to_pydatetime() <= end:
                return ts + shift
        return ts

    df = df.copy()
    df[time_col] = times.apply(sync_time)
    return df
