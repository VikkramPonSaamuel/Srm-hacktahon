from datetime import datetime, timedelta, timezone
import statistics
from typing import List, Optional, Tuple


def to_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Convert any naive datetime to UTC (assuming UTC) or convert timezone-aware datetime to UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def parse_time_range(
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    preset: Optional[str] = None,
) -> Tuple[datetime, datetime]:
    """
    Parse and validate a timezone-safe time range.
    Supports presets: '1h', '6h', '24h', '1d', '7d', '30d', 'all'.
    Defaults to last 24 hours if neither start_time nor preset is provided.
    """
    now = datetime.now(timezone.utc)
    utc_end = to_utc(end_time) if end_time is not None else now

    if start_time is not None:
        utc_start = to_utc(start_time)
    elif preset:
        preset_clean = preset.strip().lower()
        if preset_clean in ("1h", "hour"):
            utc_start = utc_end - timedelta(hours=1)
        elif preset_clean in ("6h", "6hours"):
            utc_start = utc_end - timedelta(hours=6)
        elif preset_clean in ("24h", "1d", "day", "today"):
            utc_start = utc_end - timedelta(hours=24)
        elif preset_clean in ("7d", "week", "1w"):
            utc_start = utc_end - timedelta(days=7)
        elif preset_clean in ("30d", "month", "1m"):
            utc_start = utc_end - timedelta(days=30)
        elif preset_clean in ("all", "all_time"):
            utc_start = datetime(1970, 1, 1, tzinfo=timezone.utc)
        else:
            utc_start = utc_end - timedelta(hours=24)
    else:
        utc_start = utc_end - timedelta(hours=24)

    if utc_start > utc_end:
        utc_start, utc_end = utc_end, utc_start

    return utc_start, utc_end


def calculate_percentile(values: List[float], percentile: float) -> float:
    """Calculate the p-th percentile (0-100) of a list of floats."""
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    k = (len(sorted_vals) - 1) * (percentile / 100.0)
    f = int(k)
    c = f + 1
    if c >= len(sorted_vals):
        return round(float(sorted_vals[-1]), 2)
    d = k - f
    return round(float(sorted_vals[f] + d * (sorted_vals[c] - sorted_vals[f])), 2)


def calculate_median(values: List[float]) -> Optional[float]:
    """Calculate the median of a list of floats or return None if empty."""
    if not values:
        return None
    return round(float(statistics.median(values)), 2)
