# %% [markdown]
# # KVES National Rasterization Pipeline
#
# Generalizes `Rasterize_KVES.ipynb` (single state) to batch-process all 14
# zipped state shapefiles into: per-state GeoTIFFs + lookup tables, a single
# master lookup, and one merged national GeoTIFF.
#
# Key differences from the single-state notebook (see chat for why):
#   1. raster_id comes from ONE master lookup built across all states first
#      (optionally reusing your existing Codes_Class_EnglishCzech.xlsx so
#      numbering stays consistent with the dashboard/matrices already built).
#   2. No dissolve() before rasterizing — same output, ~85% less runtime.
#   3. dtype uint8 instead of int32 (fits <=255 classes, 4x smaller).
#   4. Resumable: already-processed states are skipped unless FORCE_REPROCESS.
#   5. One bad zip doesn't kill the batch — errors are logged and collected.
#   6. Lookups include KATEGORIE (Czech name) and vector-computed area
#      (m2/ha/km2), both per-state and rolled up nationally in the master
#      lookup.
#   7. A reusable reproject_to_reference() helper at the bottom for warping
#      future overlay rasters (e.g. EPSG:4326 ecosystem-health layers) onto
#      this raster's exact EPSG:5514 grid.
#
# Run cells top to bottom. Recommend testing on 1-2 states first (set
# LIMIT_STATES below) before committing to the full overnight run.

# %%
import time
import shutil
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import geopandas as gpd
import fiona
import rasterio
from rasterio.features import rasterize
from rasterio.transform import from_bounds
from rasterio.merge import merge as rio_merge
from rasterio.warp import reproject, Resampling

# ==========================================================
# CONFIGURATION
# ==========================================================

INPUT_ZIP_DIR = Path("/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/KVES")
EXTRACT_DIR = Path("/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/_extracted")

RASTER_OUTPUT_DIR = Path("/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/Outputs/Rasterization")
LOOKUP_OUTPUT_DIR = Path("/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/Outputs/LookupTables")

for d in (EXTRACT_DIR, RASTER_OUTPUT_DIR, LOOKUP_OUTPUT_DIR):
    d.mkdir(parents=True, exist_ok=True)

PIXEL_SIZE = 10
KOD_FIELD = "KOD"
KATEGORIE_FIELD = "KATEGORIE"  # Czech-language class name, carried into the lookups
RASTER_DTYPE = "uint8"  # fine up to 255 classes; we assert this below

# Point this at your existing lookup to keep raster_id numbering consistent
# with the dashboard/matrices already built. Set to None for a fresh,
# from-scratch numbering instead.
REFERENCE_LOOKUP_PATH = Path(
    "/Users/alonso.gonzalez.glez/Desktop/Code_Datasets/JuneEdition/Codes_Class_EnglishCzech.xlsx"
)
REFERENCE_KOD_COL = "KOD"
REFERENCE_ID_COL = "raster_id"

FORCE_REPROCESS = False      # if True, reprocess states even if outputs already exist
CLEANUP_EXTRACTED = True     # delete each state's unzipped shapefile after processing
LIMIT_STATES = None          # set to e.g. 2 to test on a couple of states first

MASTER_LOOKUP_CSV = LOOKUP_OUTPUT_DIR / "KVES_KOD_lookup_MASTER.csv"
MASTER_LOOKUP_XLSX = LOOKUP_OUTPUT_DIR / "KVES_KOD_lookup_MASTER.xlsx"
NATIONAL_RASTER_PATH = RASTER_OUTPUT_DIR / "KVES_KOD_NATIONAL.tif"

# ==========================================================
# TIMER (same style as the original notebook)
# ==========================================================

global_start = time.perf_counter()

def log(msg):
    elapsed = time.perf_counter() - global_start
    print(f"[{elapsed:8.2f}s] {msg}")

# %% [markdown]
# ## Helpers: unzip + locate the .shp inside
#
# Filters out macOS's `__MACOSX` / `._*` AppleDouble artifacts that a Mac-
# created zip bundles alongside the real files — otherwise the glob below
# finds two ".shp" matches per state and errors out.

# %%
def extract_zip(zip_path: Path) -> Path:
    state_name = zip_path.stem
    out_dir = EXTRACT_DIR / state_name
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(out_dir)
    return out_dir


def find_shapefile(extracted_dir: Path) -> Path:
    matches = [
        p for p in extracted_dir.rglob("*.shp")
        if "__MACOSX" not in p.parts and not p.name.startswith("._")
    ]
    if len(matches) == 0:
        raise FileNotFoundError(f"No .shp found inside {extracted_dir}")
    if len(matches) > 1:
        raise ValueError(
            f"Multiple .shp found inside {extracted_dir}, expected exactly one: {matches}"
        )
    return matches[0]

# %% [markdown]
# ## Pass 1 — build the MASTER KOD -> raster_id (+ KATEGORIE) lookup
#
# Uses `fiona(..., ignore_geometry=True)` to scan just the attribute table
# of every state (fast — no geometry parsing), so this whole pass should
# take seconds/state rather than the ~75s/state a full geometry read costs.

# %%
zip_files = sorted(INPUT_ZIP_DIR.glob("*.zip"))
if LIMIT_STATES:
    zip_files = zip_files[:LIMIT_STATES]

log(f"Found {len(zip_files)} state zip(s).")

all_kods = set()
kod_to_kategorie = {}
state_shapefile_cache = {}  # state_name -> extracted .shp path, reused in Pass 2

for zip_path in zip_files:
    state_name = zip_path.stem
    log(f"[{state_name}] Extracting + scanning KOD/KATEGORIE values...")
    extracted_dir = extract_zip(zip_path)
    shp_path = find_shapefile(extracted_dir)
    state_shapefile_cache[state_name] = shp_path

    with fiona.open(shp_path, ignore_geometry=True) as src:
        props_schema = src.schema["properties"]
        if KOD_FIELD not in props_schema:
            raise ValueError(
                f"[{state_name}] Field '{KOD_FIELD}' not found. "
                f"Available: {list(props_schema.keys())}"
            )
        has_kategorie = KATEGORIE_FIELD in props_schema

        state_kods = set()
        for rec in src:
            k = str(rec["properties"][KOD_FIELD])
            state_kods.add(k)
            if has_kategorie and k not in kod_to_kategorie:
                kat = rec["properties"].get(KATEGORIE_FIELD)
                if kat is not None:
                    kod_to_kategorie[k] = kat

    all_kods.update(state_kods)
    log(f"[{state_name}] {len(state_kods)} unique KOD values found.")

log(f"Total unique KOD values across all states: {len(all_kods)}")

# %%
# Build the master lookup, reusing REFERENCE_LOOKUP_PATH's assignments where
# possible so raster_id stays consistent with the existing dashboard/matrices.

existing_assignments = {}
if REFERENCE_LOOKUP_PATH and Path(REFERENCE_LOOKUP_PATH).exists():
    ref = pd.read_excel(REFERENCE_LOOKUP_PATH)
    ref[REFERENCE_KOD_COL] = ref[REFERENCE_KOD_COL].astype(str)
    existing_assignments = dict(zip(ref[REFERENCE_KOD_COL], ref[REFERENCE_ID_COL].astype(int)))
    log(f"Loaded {len(existing_assignments)} existing KOD->raster_id assignments from reference file.")
else:
    log("No reference lookup used — building numbering from scratch.")

new_kods = sorted(k for k in all_kods if k not in existing_assignments)
next_id = (max(existing_assignments.values()) + 1) if existing_assignments else 1

master_rows = [{"KOD": k, "raster_id": rid} for k, rid in existing_assignments.items() if k in all_kods]
for i, k in enumerate(new_kods):
    master_rows.append({"KOD": k, "raster_id": next_id + i})

master_lookup = pd.DataFrame(master_rows).sort_values("raster_id").reset_index(drop=True)
master_lookup["KATEGORIE"] = master_lookup["KOD"].map(kod_to_kategorie)

assert master_lookup["raster_id"].max() <= 255, (
    "More than 255 classes found — uint8 won't fit them, switch RASTER_DTYPE "
    "to 'uint16' or 'int32' and rerun."
)
assert master_lookup["raster_id"].is_unique, "Duplicate raster_id in master lookup — investigate."

kod_to_id = dict(zip(master_lookup["KOD"], master_lookup["raster_id"]))

master_lookup.to_csv(MASTER_LOOKUP_CSV, index=False)
master_lookup.to_excel(MASTER_LOOKUP_XLSX, index=False)
log(f"Master lookup written: {MASTER_LOOKUP_CSV.name} / {MASTER_LOOKUP_XLSX.name} ({len(master_lookup)} classes)")
if new_kods:
    log(f"NOTE: {len(new_kods)} KOD value(s) not in the reference file were appended: {new_kods}")

# %% [markdown]
# ## Pass 2 — per-state rasterize (no dissolve, uint8, master raster_id)
#
# Also computes area per KOD directly from the vector geometries (cheap —
# already loaded in memory, just a groupby-sum) rather than from the raster,
# which would add rasterization edge-rounding error for no time savings.

# %%
failures = []
national_area_accum = {}  # KOD -> running total area_m2 across all states

for zip_path in zip_files:
    state_name = zip_path.stem
    raster_out = RASTER_OUTPUT_DIR / f"{state_name}.tif"
    lookup_out_csv = LOOKUP_OUTPUT_DIR / f"{state_name}_lookup.csv"
    lookup_out_xlsx = LOOKUP_OUTPUT_DIR / f"{state_name}_lookup.xlsx"

    if not FORCE_REPROCESS and raster_out.exists() and lookup_out_xlsx.exists():
        log(f"[{state_name}] Already processed, skipping (set FORCE_REPROCESS=True to redo).")
        continue

    state_t0 = time.perf_counter()
    try:
        log(f"[{state_name}] Reading full shapefile...")
        shp_path = state_shapefile_cache.get(state_name) or find_shapefile(extract_zip(zip_path))
        gdf = gpd.read_file(shp_path)
        log(f"[{state_name}] Loaded {len(gdf):,} polygons")

        if KOD_FIELD not in gdf.columns:
            raise ValueError(f"Field '{KOD_FIELD}' not found. Available: {gdf.columns.tolist()}")

        gdf["RASTER_ID"] = gdf[KOD_FIELD].astype(str).map(kod_to_id)
        unmapped = gdf["RASTER_ID"].isna().sum()
        if unmapped:
            raise ValueError(f"{unmapped} polygon(s) had a KOD not present in the master lookup.")
        gdf["RASTER_ID"] = gdf["RASTER_ID"].astype(np.uint8)

        # area per KOD, straight from the vector geometries (gdf.crs is the
        # projected EPSG:5514, so .area is already in square meters)
        gdf["area_m2"] = gdf.geometry.area
        state_area = gdf.groupby(KOD_FIELD)["area_m2"].sum()
        for k, v in state_area.items():
            national_area_accum[k] = national_area_accum.get(k, 0.0) + v

        # per-state lookup: which classes are present here, with counts + area
        counts = gdf.groupby(KOD_FIELD).size().rename("polygon_count")
        state_lookup = master_lookup.merge(counts, left_on="KOD", right_index=True, how="inner")
        state_lookup = state_lookup.merge(state_area.rename("area_m2"), left_on="KOD", right_index=True, how="left")
        state_lookup["area_ha"] = state_lookup["area_m2"] / 10_000
        state_lookup["area_km2"] = state_lookup["area_m2"] / 1_000_000
        state_lookup = state_lookup.sort_values("raster_id").reset_index(drop=True)
        state_lookup.to_csv(lookup_out_csv, index=False)
        state_lookup.to_excel(lookup_out_xlsx, index=False)
        log(f"[{state_name}] Lookup written ({len(state_lookup)} classes present)")

        # NOTE: no dissolve() here on purpose — rasterize() paints per-polygon
        # regardless of overlap/adjacency, so the burned raster is identical
        # either way. Skipping it is what buys back ~85% of the runtime.
        minx, miny, maxx, maxy = gdf.total_bounds
        width = int(np.ceil((maxx - minx) / PIXEL_SIZE))
        height = int(np.ceil((maxy - miny) / PIXEL_SIZE))
        transform = from_bounds(minx, miny, maxx, maxy, width, height)
        log(f"[{state_name}] Raster size: {width:,} x {height:,} ({(width*height)/1e6:.1f}M px)")

        shapes = zip(gdf.geometry, gdf["RASTER_ID"])
        t0 = time.perf_counter()
        raster = rasterize(
            shapes=shapes,
            out_shape=(height, width),
            transform=transform,
            fill=0,
            dtype=RASTER_DTYPE,
            all_touched=False,
        )
        log(f"[{state_name}] Rasterized in {time.perf_counter()-t0:.2f}s")

        with rasterio.open(
            raster_out, "w", driver="GTiff",
            height=height, width=width, count=1,
            dtype=RASTER_DTYPE, crs=gdf.crs, transform=transform,
            compress="LZW", tiled=True, BIGTIFF="IF_SAFER",
        ) as dst:
            dst.write(raster, 1)
        log(f"[{state_name}] Raster written: {raster_out.name}")

        if CLEANUP_EXTRACTED:
            shutil.rmtree(EXTRACT_DIR / state_name, ignore_errors=True)

        log(f"[{state_name}] DONE in {time.perf_counter()-state_t0:.2f}s")

    except Exception as e:
        log(f"[{state_name}] FAILED: {e}")
        failures.append((state_name, str(e)))

log(f"Pass 2 complete. {len(failures)} failure(s).")
for name, err in failures:
    print(f"  - {name}: {err}")

# %% [markdown]
# ## Roll the national area totals into the master lookup

# %%
master_lookup["area_m2_national"] = master_lookup["KOD"].map(national_area_accum).fillna(0.0)
master_lookup["area_km2_national"] = master_lookup["area_m2_national"] / 1_000_000
master_lookup.to_csv(MASTER_LOOKUP_CSV, index=False)
master_lookup.to_excel(MASTER_LOOKUP_XLSX, index=False)
log("Master lookup updated with national area totals.")

# %% [markdown]
# ## Pass 3 — merge all per-state rasters into one national mosaic
#
# `rasterio.merge` handles the sub-millimeter pixel-size differences between
# independently-computed state grids via nearest-neighbor resampling, which
# is lossless for categorical class data like this.

# %%
state_rasters = sorted(
    p for p in RASTER_OUTPUT_DIR.glob("*.tif") if p.name != NATIONAL_RASTER_PATH.name
)
log(f"Merging {len(state_rasters)} state raster(s) into national mosaic...")

srcs = [rasterio.open(p) for p in state_rasters]
t0 = time.perf_counter()
mosaic, out_transform = rio_merge(srcs, resampling=rasterio.enums.Resampling.nearest)
log(f"Merge computed in {time.perf_counter()-t0:.2f}s, shape {mosaic.shape}")

meta = srcs[0].meta.copy()
meta.update({
    "height": mosaic.shape[1],
    "width": mosaic.shape[2],
    "transform": out_transform,
    "dtype": RASTER_DTYPE,
    "compress": "LZW",
    "tiled": True,
    "BIGTIFF": "IF_SAFER",
})

with rasterio.open(NATIONAL_RASTER_PATH, "w", **meta) as dst:
    dst.write(mosaic)

for s in srcs:
    s.close()

log(f"National raster written: {NATIONAL_RASTER_PATH}")
log("ALL DONE")

print("\nOutputs:")
print(" Per-state rasters :", RASTER_OUTPUT_DIR)
print(" Per-state lookups :", LOOKUP_OUTPUT_DIR)
print(" Master lookup     :", MASTER_LOOKUP_XLSX)
print(" National raster   :", NATIONAL_RASTER_PATH)
print(f"\nTotal runtime: {time.perf_counter()-global_start:.2f} seconds")

# %% [markdown]
# ## For later: reprojecting future overlay rasters onto this grid
#
# This KVES national raster is anchored in EPSG:5514 (meters, projected —
# correct for area/fixed-resolution work). If a future raster (e.g. an
# ecosystem-health index in EPSG:4326) needs to be combined with it
# pixel-for-pixel, warp that OTHER raster onto THIS one's exact grid — not
# the other way around, since reprojecting KVES into a geographic CRS like
# 4326 would distort its pixel areas.
#
# Resampling choice matters: use `Resampling.nearest` for categorical
# rasters (won't invent blended class values), `Resampling.bilinear` or
# `.cubic` for continuous-valued rasters like an EI score.

# %%
def reproject_to_reference(src_path, reference_path, dst_path, resampling=Resampling.bilinear):
    """
    Reproject/resample src_path onto the exact grid (CRS, transform, size)
    of reference_path, so the two rasters become directly combinable
    pixel-for-pixel (e.g. via straight numpy array math after both are
    opened).
    """
    with rasterio.open(reference_path) as ref:
        ref_crs = ref.crs
        ref_transform = ref.transform
        ref_width = ref.width
        ref_height = ref.height

    with rasterio.open(src_path) as src:
        kwargs = src.meta.copy()
        kwargs.update({
            "crs": ref_crs,
            "transform": ref_transform,
            "width": ref_width,
            "height": ref_height,
        })
        with rasterio.open(dst_path, "w", **kwargs) as dst:
            for band_idx in range(1, src.count + 1):
                reproject(
                    source=rasterio.band(src, band_idx),
                    destination=rasterio.band(dst, band_idx),
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=ref_transform,
                    dst_crs=ref_crs,
                    resampling=resampling,
                )
    return dst_path


# Example usage, once you have a future overlay raster to combine with this one:
#
# reproject_to_reference(
#     src_path="/path/to/some_ei_index_epsg4326.tif",
#     reference_path=NATIONAL_RASTER_PATH,
#     dst_path="/path/to/some_ei_index_warped_to_5514.tif",
#     resampling=Resampling.bilinear,  # continuous data
# )
