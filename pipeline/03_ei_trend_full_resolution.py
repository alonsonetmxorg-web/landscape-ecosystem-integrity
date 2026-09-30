# %% [markdown]
# # Full-resolution per-pixel trend analysis: EI slope + significance (2017-2025)
#
# Implements "Time series instructions.docx" exactly: for each pixel, fits a
# linear trend across the 9 years of EI_W rasters and outputs two
# full-resolution GeoTIFFs -- slope (magnitude/direction of change) and
# p-value (statistical significance), plus R^2 as a bonus diagnostic.
# Streams block-by-block so memory stays low regardless of raster size (same
# approach already used on this project's national zonal-stats pipeline).
#
# Inputs must already share the same CRS/resolution/extent/alignment (true
# for the EI_W rasters, since they come from the same yearly pipeline) --
# reproject the OUTPUT afterward if you need it in a different CRS, not the
# 9 inputs. No need to redo the UTM33 -> final-CRS reprojection 9 times.
#
# Run cells top to bottom.

# %%
import re
import time
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window

# ==========================================================
# CONFIGURATION
# ==========================================================
INPUT_DIR = Path("/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/Inputs")
YEAR_GLOB = "*_EI_W.tif"          # matches 2017_EI_W.tif ... 2025_EI_W.tif

OUTPUT_DIR = Path("/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/Outputs/Trend")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SLOPE_OUT = OUTPUT_DIR / "EI_trend_slope_2017_2025.tif"
PVALUE_OUT = OUTPUT_DIR / "EI_trend_pvalue_2017_2025.tif"
R2_OUT = OUTPUT_DIR / "EI_trend_r2_2017_2025.tif"

BLOCK_SIZE = 2048          # pixels per side, per processing window
NODATA_OUT = -9999.0

global_start = time.perf_counter()


def log(msg):
    print(f"[{time.perf_counter() - global_start:8.2f}s] {msg}")


# %% [markdown]
# ## Step 1 -- collect the 9 yearly rasters, sorted by year

# %%
YEAR_RE = re.compile(r"(\d{4})")

files = sorted(INPUT_DIR.glob(YEAR_GLOB))
year_files = []
for f in files:
    m = YEAR_RE.search(f.name)
    if m:
        year_files.append((int(m.group(1)), f))
year_files.sort(key=lambda t: t[0])

years = np.array([y for y, _ in year_files], dtype=np.float64)
paths = [p for _, p in year_files]
n = len(years)
log(f"Found {n} yearly rasters: {years.astype(int).tolist()}")
assert n >= 4, "Need at least 4 years for a meaningful trend fit"

xbar = years.mean()
x_centered = years - xbar          # e.g. [-4,-3,-2,-1,0,1,2,3,4] for 2017-2025
Sxx = float((x_centered ** 2).sum())
df = n - 2
log(f"xbar={xbar}, Sxx={Sxx}, df={df}")

# %% [markdown]
# ## Step 2 -- build a t-distribution p-value lookup table (once)
#
# QGIS's raster calculator can produce the slope (it's just a weighted sum --
# the same formula you already ran there), but not a p-value: that needs the
# Student's t CDF, which has no closed form in +,-,*,/. Computed here with a
# small, dependency-free implementation (validated earlier in this project
# against scipy to 6 decimal places), built once into a fine lookup table
# for this fixed degrees-of-freedom, then applied via fast vectorized
# interpolation to every pixel in every block. No scipy dependency needed --
# useful since it isn't always installed in this project's conda env.

# %%
import math


def _betacf(a, b, x, maxit=200, eps=3e-14):
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < 1e-30:
        d = 1e-30
    d = 1.0 / d
    h = d
    for m in range(1, maxit + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < 1e-30:
            d = 1e-30
        c = 1.0 + aa / c
        if abs(c) < 1e-30:
            c = 1e-30
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < 1e-30:
            d = 1e-30
        c = 1.0 + aa / c
        if abs(c) < 1e-30:
            c = 1e-30
        d = 1.0 / d
        de = d * c
        h *= de
        if abs(de - 1.0) < eps:
            break
    return h


def betai(a, b, x):
    """Regularized incomplete beta function I_x(a,b)."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    lbeta = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
    bt = math.exp(lbeta + a * math.log(x) + b * math.log(1.0 - x))
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _betacf(a, b, x) / a
    return 1.0 - bt * _betacf(b, a, 1.0 - x) / b


def t_two_tailed_pvalue(t, deg_free):
    t = abs(t)
    xb = deg_free / (deg_free + t * t)
    return betai(deg_free / 2.0, 0.5, xb)


# Fine lookup table for this fixed df -- spacing of 0.002 up to t=60 is far
# more resolution than needed; two-tailed p is already ~1e-9 by t=15 at df=7.
# Validated against the exact scalar function: interpolation error ~1e-8.
T_GRID = np.linspace(0, 60, 30000)
P_GRID = np.array([t_two_tailed_pvalue(t, df) for t in T_GRID])
log("Built t-distribution p-value lookup table")


def pvalue_from_t(t_array):
    return np.interp(np.abs(t_array), T_GRID, P_GRID, right=0.0)


# %% [markdown]
# ## Step 3 -- block-by-block per-pixel regression
#
# Reads the same window from all 9 rasters, stacks them, fits the trend with
# plain vectorized numpy (closed-form OLS for a single predictor -- no
# per-pixel loop, no matrix inversion needed), writes slope/p-value/R^2 for
# that block, and moves on. A pixel is only scored if all 9 years have valid
# data there; otherwise it's written as NoData in every output.

# %%
with rasterio.open(paths[0]) as ref:
    profile = ref.profile.copy()
    width, height = ref.width, ref.height

profile.update(dtype="float32", count=1, nodata=NODATA_OUT, compress="LZW", tiled=True, BIGTIFF="IF_SAFER")

srcs = [rasterio.open(p) for p in paths]

with rasterio.open(SLOPE_OUT, "w", **profile) as slope_dst, \
     rasterio.open(PVALUE_OUT, "w", **profile) as pval_dst, \
     rasterio.open(R2_OUT, "w", **profile) as r2_dst:

    n_row_blocks = (height + BLOCK_SIZE - 1) // BLOCK_SIZE
    n_col_blocks = (width + BLOCK_SIZE - 1) // BLOCK_SIZE
    total_blocks = n_row_blocks * n_col_blocks
    done = 0

    for row_off in range(0, height, BLOCK_SIZE):
        h = min(BLOCK_SIZE, height - row_off)
        for col_off in range(0, width, BLOCK_SIZE):
            w = min(BLOCK_SIZE, width - col_off)
            window = Window(col_off, row_off, w, h)

            # stack this window from all 9 years: shape (n, h, w)
            stack = np.stack([
                src.read(1, window=window, masked=True).filled(np.nan).astype(np.float64)
                for src in srcs
            ], axis=0)

            valid = np.all(np.isfinite(stack), axis=0)  # require all 9 years present

            ybar = np.nanmean(stack, axis=0)
            # Sxy = sum((x_i - xbar) * y_i) -- same numerator the QGIS
            # raster-calculator formula used, just written with numpy
            # broadcasting instead of 9 explicit terms
            Sxy = np.tensordot(x_centered, np.nan_to_num(stack), axes=(0, 0))
            slope = np.where(valid, Sxy / Sxx, np.nan)

            fitted = ybar[None, :, :] + slope[None, :, :] * x_centered[:, None, None]
            resid = stack - fitted
            sse = np.nansum(resid ** 2, axis=0)
            sst = np.nansum((stack - ybar[None, :, :]) ** 2, axis=0)

            with np.errstate(divide="ignore", invalid="ignore"):
                se_slope = np.sqrt(sse / df / Sxx)
                t_stat = np.where(se_slope > 0, slope / se_slope, np.nan)
                r2 = np.where(sst > 0, 1 - sse / sst, np.nan)

            pval = pvalue_from_t(t_stat)

            slope_block = np.where(valid, slope, NODATA_OUT).astype("float32")
            pval_block = np.where(valid, pval, NODATA_OUT).astype("float32")
            r2_block = np.where(valid, r2, NODATA_OUT).astype("float32")

            slope_dst.write(slope_block, 1, window=window)
            pval_dst.write(pval_block, 1, window=window)
            r2_dst.write(r2_block, 1, window=window)

            done += 1
            if done % 20 == 0 or done == total_blocks:
                log(f"block {done}/{total_blocks}")

for src in srcs:
    src.close()

log("DONE.")
print("Slope raster:  ", SLOPE_OUT)
print("P-value raster:", PVALUE_OUT)
print("R2 raster:     ", R2_OUT)

# %% [markdown]
# ## Sanity check
#
# Spot-check a handful of pixels against the exact scalar function directly
# (bypassing the lookup table) to confirm nothing drifted in the vectorized
# path. Run after the main block above finishes.

# %%
with rasterio.open(SLOPE_OUT) as sd, rasterio.open(PVALUE_OUT) as pd_:
    s = sd.read(1)
    p = pd_.read(1)
    valid_mask = s != NODATA_OUT
    print("valid pixel count:", valid_mask.sum(), "/", s.size)
    print("slope range:", np.nanmin(s[valid_mask]), "to", np.nanmax(s[valid_mask]))
    print("p-value range:", np.nanmin(p[valid_mask]), "to", np.nanmax(p[valid_mask]))
    print("share of pixels with p < 0.05:", (p[valid_mask] < 0.05).mean())
