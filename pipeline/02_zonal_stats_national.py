# %% [markdown]
# # National Multi-Year Zonal Statistics: ORP x KVES-class x EI
#
# Generalizes ZonalStats.ipynb to run across all 9 years at national scale.
# Same core idea as your original notebook — cross-tabulate (ORP polygon x
# KVES class) pixels and take the mean EI value per pair — but:
#
#   1. The 9 EI rasters are in EPSG:32633 at ~7m pixels; KVES_KOD_NATIONAL is
#      EPSG:5514 at 10m. Each EI raster gets warped onto the KVES grid via a
#      WarpedVRT (bilinear — EI is continuous), read in small windows.
#   2. Nothing is ever fully loaded into memory except the KVES raster and
#      the ORP raster (both ~1-1.5GB, loaded once, reused across all 9
#      years). The EI data is read window-by-window directly from the
#      original 8-10GB files — no second warped copy is ever written to
#      disk, and peak memory stays low regardless of how big the source
#      files are.
#   3. Output matches the existing ORP_KOD_EI_matrix_YYYY.csv shape your
#      dashboard pipeline already expects (index=ORP_KOD, columns=raster_id
#      1..44, values=mean EI), plus a fuller long-format file per year with
#      mean/std/min/max/count for anything else you might want later.
#   4. Resumable — both the one-time ORP rasterization and each year's
#      stats are skipped if their output already exists.
#
# Run cells top to bottom. Test with LIMIT_YEARS = 1 first.

# %%
import re
import time
import glob
from pathlib import Path

import numpy as np
import pandas as pd
import geopandas as gpd
import rasterio
from rasterio.features import rasterize
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
from rasterio.windows import Window

# ==========================================================
# CONFIGURATION
# ==========================================================

KVES_PATH = Path("/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/Outputs/Rasterization/KVES_KOD_NATIONAL.tif")
ORP_GEOJSON_PATH = Path("/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/Inputs/ORPs_Czechia.geojson")
ORP_FIELD = "KOD"

EI_INPUT_DIR = Path("/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/Inputs")
EI_GLOB = "*_EI_W.tif"
EI_YEAR_PATTERN = re.compile(r"(\d{4})")

ORP_RASTER_OUT = Path("/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/Outputs/Rasterization/ORP_raster_NATIONAL.tif")
ZONAL_OUTPUT_DIR = Path("/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/Outputs/ZonalStats")
ZONAL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

BLOCK_SIZE = 4096          # pixels per side, per processing window
FORCE_REPROCESS = False    # if True, redo years/ORP-raster even if outputs exist
LIMIT_YEARS = None         # set to e.g. 1 to test on a single year first

global_start = time.perf_counter()

def log(msg):
    print(f"[{time.perf_counter()-global_start:8.2f}s] {msg}")

# %% [markdown]
# ## Step 1 — load the KVES national raster (reference grid, loaded once)

# %%
with rasterio.open(KVES_PATH) as ref:
    ref_crs = ref.crs
    ref_transform = ref.transform
    ref_width = ref.width
    ref_height = ref.height
    kves_arr = ref.read(1)  # uint8, ~1.4GB — fine to hold in memory once

log(f"KVES loaded: {ref_width:,} x {ref_height:,}, crs={ref_crs}")

# %% [markdown]
# ## Step 2 — rasterize ORPs onto the same grid (one-time, reused every year)

# %%
if ORP_RASTER_OUT.exists() and not FORCE_REPROCESS:
    log("ORP raster already exists, loading it instead of rebuilding.")
    with rasterio.open(ORP_RASTER_OUT) as src:
        orp_arr = src.read(1)
else:
    orp = gpd.read_file(ORP_GEOJSON_PATH)
    log(f"ORP polygons loaded: {len(orp):,}")

    if orp.crs != ref_crs:
        log(f"Reprojecting ORP layer from {orp.crs} to {ref_crs}...")
        orp = orp.to_crs(ref_crs)

    if ORP_FIELD not in orp.columns:
        raise ValueError(f"'{ORP_FIELD}' not found. Available: {orp.columns.tolist()}")

    shapes = ((geom, int(code)) for geom, code in zip(orp.geometry, orp[ORP_FIELD]))

    t0 = time.perf_counter()
    orp_arr = rasterize(
        shapes=shapes,
        out_shape=(ref_height, ref_width),
        transform=ref_transform,
        fill=0,
        dtype="int32",
        all_touched=False,
    )
    log(f"ORP rasterized in {time.perf_counter()-t0:.2f}s")

    profile = {
        "driver": "GTiff", "height": ref_height, "width": ref_width, "count": 1,
        "dtype": "int32", "crs": ref_crs, "transform": ref_transform,
        "compress": "LZW", "tiled": True, "BIGTIFF": "IF_SAFER", "nodata": 0,
    }
    with rasterio.open(ORP_RASTER_OUT, "w", **profile) as dst:
        dst.write(orp_arr, 1)
    log(f"ORP raster saved: {ORP_RASTER_OUT}")

# %% [markdown]
# ## Step 3 — per-year streaming zonal stats
#
# For each year: wrap the source EI raster in a WarpedVRT matching the KVES
# grid exactly, then loop over blocks reading only that window from the VRT
# (which warps on-demand from the original file — no full copy created).
# Per-block partial stats (count/sum/sumsq/min/max) accumulate into a plain
# dict keyed by (ORP_KOD, raster_id); finalized into mean/std at the end.

# %%
def accumulate_block(acc, orp_block, kod_block, ei_block):
    mask = (orp_block > 0) & (kod_block > 0) & np.isfinite(ei_block)
    if not mask.any():
        return
    df = pd.DataFrame({
        "ORP_KOD": orp_block[mask],
        "KOD": kod_block[mask],
        "EI": ei_block[mask].astype(np.float64),  # float64 for stable sumsq accumulation
    })
    grouped = df.groupby(["ORP_KOD", "KOD"])["EI"].agg(
        count="count", sum="sum", sumsq=lambda s: (s ** 2).sum(), min="min", max="max"
    )
    for (orp_kod, kod), row in grouped.iterrows():
        key = (int(orp_kod), int(kod))
        if key not in acc:
            acc[key] = [0, 0.0, 0.0, row["min"], row["max"]]
        entry = acc[key]
        entry[0] += int(row["count"])
        entry[1] += row["sum"]
        entry[2] += row["sumsq"]
        entry[3] = min(entry[3], row["min"])
        entry[4] = max(entry[4], row["max"])


def finalize_accumulator(acc):
    rows = []
    for (orp_kod, kod), (count, s, sumsq, mn, mx) in acc.items():
        mean = s / count
        variance = max(sumsq / count - mean ** 2, 0.0)
        rows.append({
            "ORP_KOD": orp_kod, "KOD": kod,
            "mean_EI": mean, "std_EI": variance ** 0.5,
            "min_EI": mn, "max_EI": mx, "count": count,
        })
    return pd.DataFrame(rows)


def process_year(ei_path: Path, year: int):
    matrix_out = ZONAL_OUTPUT_DIR / f"ORP_KOD_EI_matrix_{year}.csv"
    fullstats_out = ZONAL_OUTPUT_DIR / f"ORP_KOD_EI_fullstats_{year}.csv"

    if not FORCE_REPROCESS and matrix_out.exists():
        log(f"[{year}] Already processed, skipping.")
        return

    year_t0 = time.perf_counter()
    acc = {}

    with rasterio.open(ei_path) as src:
        src_nodata = src.nodata
        with WarpedVRT(
            src,
            crs=ref_crs,
            transform=ref_transform,
            width=ref_width,
            height=ref_height,
            resampling=Resampling.bilinear,
            src_nodata=src_nodata,
            nodata=np.nan,
        ) as vrt:
            n_row_blocks = (ref_height + BLOCK_SIZE - 1) // BLOCK_SIZE
            n_col_blocks = (ref_width + BLOCK_SIZE - 1) // BLOCK_SIZE
            total_blocks = n_row_blocks * n_col_blocks
            done = 0

            for row_off in range(0, ref_height, BLOCK_SIZE):
                h = min(BLOCK_SIZE, ref_height - row_off)
                for col_off in range(0, ref_width, BLOCK_SIZE):
                    w = min(BLOCK_SIZE, ref_width - col_off)
                    window = Window(col_off, row_off, w, h)

                    kves_block = kves_arr[row_off:row_off + h, col_off:col_off + w]
                    orp_block = orp_arr[row_off:row_off + h, col_off:col_off + w]
                    ei_block = vrt.read(1, window=window)

                    accumulate_block(acc, orp_block, kves_block, ei_block)

                    done += 1
                    if done % 20 == 0 or done == total_blocks:
                        log(f"[{year}] block {done}/{total_blocks}")

    full_df = finalize_accumulator(acc)
    full_df.to_csv(fullstats_out, index=False)

    matrix = full_df.pivot(index="ORP_KOD", columns="KOD", values="mean_EI")
    matrix.to_csv(matrix_out)

    log(f"[{year}] DONE in {time.perf_counter()-year_t0:.2f}s -> {matrix_out.name}")


# %%
ei_files = sorted(EI_INPUT_DIR.glob(EI_GLOB))
if LIMIT_YEARS:
    ei_files = ei_files[:LIMIT_YEARS]

log(f"Found {len(ei_files)} EI raster(s).")

failures = []
for ei_path in ei_files:
    m = EI_YEAR_PATTERN.search(ei_path.name)
    if not m:
        log(f"SKIP (no 4-digit year in filename): {ei_path.name}")
        continue
    year = int(m.group(1))
    try:
        process_year(ei_path, year)
    except Exception as e:
        log(f"[{year}] FAILED: {e}")
        failures.append((year, str(e)))

log(f"ALL DONE. {len(failures)} failure(s).")
for year, err in failures:
    print(f"  - {year}: {err}")

print("\nOutputs:", ZONAL_OUTPUT_DIR)
print(f"Total runtime: {time.perf_counter()-global_start:.2f}s")
