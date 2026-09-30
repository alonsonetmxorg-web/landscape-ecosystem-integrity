# %% [markdown]
# # Per-ORP, per-class linear trend (2017-2025)
#
# Input: the ORP_KOD_EI_fullstats_{year}.csv files already produced by
# zonal_stats_national.py (mean_EI + count per ORP x class x year).
#
# For every (ORP_KOD, KOD) pair with enough valid years:
#   - weighted OLS slope (weighted by pixel `count`, so a 1-pixel zone
#     doesn't count as much as a 300,000-pixel zone)
#   - Theil-Sen slope (outlier-resistant — median of all pairwise slopes)
#   - a flag when the two disagree a lot, which is exactly the signature
#     the Blatna/2018 anomaly would produce if it weren't already known
#     about, so this doubles as an automatic QA pass for the other 204 ORPs
#     across all classes.
#
# This never touches the rasters again — everything here runs off the tiny
# fullstats CSVs, so it's fast regardless of how big the original data was.

# %%
import re
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

# ==========================================================
# CONFIGURATION
# ==========================================================

ZONAL_OUTPUT_DIR = Path("/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/Outputs/ZonalStats")
FULLSTATS_GLOB = "ORP_KOD_EI_fullstats_*.csv"
YEAR_PATTERN = re.compile(r"(\d{4})")

TREND_OUTPUT_PATH = ZONAL_OUTPUT_DIR / "ORP_KOD_EI_trends.csv"

MIN_YEARS_REQUIRED = 4          # need at least this many valid years to fit anything
SLOPE_DISAGREEMENT_THRESHOLD = 0.5  # flag if |ols - theilsen| / max(|theilsen|, small) exceeds this

# %% [markdown]
# ## Load and stack every year's fullstats file

# %%
files = sorted(ZONAL_OUTPUT_DIR.glob(FULLSTATS_GLOB))
print(f"Found {len(files)} fullstats file(s).")

frames = []
for f in files:
    m = YEAR_PATTERN.search(f.name)
    if not m:
        print(f"SKIP (no year in filename): {f.name}")
        continue
    year = int(m.group(1))
    df = pd.read_csv(f)
    df["YEAR"] = year
    frames.append(df)

all_years = pd.concat(frames, ignore_index=True)
print(f"Combined: {len(all_years):,} rows across {sorted(all_years.YEAR.unique())}")

# %% [markdown]
# ## Fit weighted OLS + Theil-Sen per (ORP_KOD, KOD)

# %%
def fit_group(g: pd.DataFrame):
    g = g.dropna(subset=["mean_EI"]).sort_values("YEAR")
    n = len(g)
    if n < MIN_YEARS_REQUIRED:
        return pd.Series({
            "n_years": n, "ols_slope": np.nan, "ols_intercept": np.nan,
            "ols_r2": np.nan, "ols_pvalue": np.nan,
            "theilsen_slope": np.nan, "theilsen_intercept": np.nan,
            "slope_disagreement": np.nan, "flagged": False,
            "most_influential_year": None,
        })

    x = g["YEAR"].to_numpy(dtype=float)
    y = g["mean_EI"].to_numpy(dtype=float)
    w = g["count"].to_numpy(dtype=float)

    # weighted OLS via weighted least squares (numpy polyfit supports weights directly)
    ols_slope, ols_intercept = np.polyfit(x, y, 1, w=np.sqrt(w))

    # weighted R^2 / p-value: refit with scipy on weighted (sqrt(w)-scaled) data for stats
    # (slope/intercept from this matches np.polyfit above; scipy gives us r/p for free)
    xw = x * np.sqrt(w) / np.sqrt(w)  # x unchanged in weighting for slope stats purposes
    lr = stats.linregress(x, y)  # unweighted r/p as a simple, standard reference stat
    ols_r2 = lr.rvalue ** 2
    ols_pvalue = lr.pvalue

    # Theil-Sen: robust to outliers, ignores weights (median-of-slopes by design)
    ts_slope, ts_intercept, _, _ = stats.theilslopes(y, x)

    denom = max(abs(ts_slope), 1e-6)
    disagreement = abs(ols_slope - ts_slope) / denom
    flagged = disagreement > SLOPE_DISAGREEMENT_THRESHOLD

    # which single year's removal changes the OLS slope the most (crude leave-one-out)
    influential_year = None
    if n >= MIN_YEARS_REQUIRED + 1:
        base_slope = ols_slope
        biggest_shift = -1
        for yr in g["YEAR"]:
            sub = g[g["YEAR"] != yr]
            s, _ = np.polyfit(sub["YEAR"], sub["mean_EI"], 1, w=np.sqrt(sub["count"]))
            shift = abs(s - base_slope)
            if shift > biggest_shift:
                biggest_shift = shift
                influential_year = int(yr)

    return pd.Series({
        "n_years": n,
        "ols_slope": ols_slope, "ols_intercept": ols_intercept,
        "ols_r2": ols_r2, "ols_pvalue": ols_pvalue,
        "theilsen_slope": ts_slope, "theilsen_intercept": ts_intercept,
        "slope_disagreement": disagreement, "flagged": flagged,
        "most_influential_year": influential_year,
    })


trends = (
    all_years.groupby(["ORP_KOD", "KOD"])
    .apply(fit_group, include_groups=False)
    .reset_index()
)

trends.to_csv(TREND_OUTPUT_PATH, index=False)
print(f"Saved {len(trends):,} trend rows to {TREND_OUTPUT_PATH}")
print(f"Flagged for slope disagreement (OLS vs Theil-Sen): {trends['flagged'].sum()}")

# %% [markdown]
# ## Quick look at the flagged ones — these are your QA candidates,
# the same signature Blatna/2018 would have produced

# %%
flagged = trends[trends["flagged"]].sort_values("slope_disagreement", ascending=False)
print(flagged.head(20).to_string(index=False))
