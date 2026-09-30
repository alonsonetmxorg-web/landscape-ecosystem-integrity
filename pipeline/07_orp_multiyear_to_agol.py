# %% [markdown]
# # ORP Multi-Year Dataset -> single GeoJSON + AGOL-ready Shapefile
#
# This is written in "# %%" cell blocks. In Jupyter/VS Code/Spyder these are
# recognized as separate cells automatically (or just copy each block into
# its own notebook cell manually).
#
# Goal: combine every year's `ORP_KOD_EI_matrix_YYYY.csv` into ONE dataset —
# one row per ORP per year — joined to the ORP geometry, then export both a
# full GeoJSON (for reference) and a 10-char-field-safe zipped Shapefile
# (for direct upload to ArcGIS Online).
#
# Run cells top to bottom. The lookup-inspection cell will print its columns
# so you can confirm/adjust the two config values right after it before
# continuing.

# %%
import os
import re
import glob
import zipfile

import pandas as pd
import geopandas as gpd

# ----------------------------
# CONFIG — paths
# ----------------------------
BASE_GEOM_PATH = "/Users/alonso.gonzalez.glez/Desktop/Code_Datasets/JuneEdition/Nazevs_Dashboard.geojson"

YEARLY_TABLES_DIR = "/Users/alonso.gonzalez.glez/Desktop/Code_Datasets/ORP_KOD_EI_matrix/Zipper"
YEARLY_TABLES_GLOB = "ORP_KOD_EI_matrix_*.csv"

LOOKUP_PATH = "/Users/alonso.gonzalez.glez/Desktop/Code_Datasets/ORP_KOD_EI_matrix/Zipper/Codes_Class_EnglishCzech.xlsx"

OUTPUT_DIR = "/Users/alonso.gonzalez.glez/Desktop/Code_Datasets/ORP_KOD_EI_matrix/output"
os.makedirs(OUTPUT_DIR, exist_ok=True)

GEOJSON_OUT = os.path.join(OUTPUT_DIR, "ORP_AllYears.geojson")
SHP_OUT = os.path.join(OUTPUT_DIR, "ORP_AllYears.shp")
SHP_ZIP_OUT = os.path.join(OUTPUT_DIR, "ORP_AllYears_shapefile.zip")
FIELD_MAP_OUT = os.path.join(OUTPUT_DIR, "shapefile_field_name_mapping.csv")

# ----------------------------
# CONFIG — column names in the base geometry / yearly tables
# ----------------------------
ORP_ID_COL = "ORP_KOD"
ORP_NAME_COL = "NAZEV"

# If the base geojson has no CRS info attached (common when exported from a
# Czech S-JTSK source without reprojecting first), we assume this EPSG code
# before reprojecting to WGS84. If the file already carries a valid CRS,
# this is skipped automatically.
ASSUMED_SOURCE_EPSG = 5514

# %% [markdown]
# ## 1. Load the base ORP geometry

# %%
gdf = gpd.read_file(BASE_GEOM_PATH)
gdf = gdf.drop(columns=["ORP_KOD"], errors="ignore")
gdf = gdf.rename(columns={"KOD": "ORP_KOD"})
gdf["ORP_KOD"] = gdf["ORP_KOD"].astype(str)

if ORP_NAME_COL in gdf.columns:
    gdf[ORP_NAME_COL] = gdf[ORP_NAME_COL].astype(str)

if gdf.crs is None:
    gdf = gdf.set_crs(epsg=ASSUMED_SOURCE_EPSG, allow_override=True)
gdf = gdf.to_crs(epsg=4326)

print("Base geometry shape:", gdf.shape)
gdf.head()

# %% [markdown]
# ## 2. Load the raster/class lookup — CHECK THE PRINTED COLUMNS
#
# `Codes_Class_EnglishCzech.xlsx` has columns: raster_id, KOD, CZECH_NAME,
# ENGLISH_NAME, CLASS. Confirm the two column names below match what's
# printed, then adjust `LOOKUP_ID_COL` / `LOOKUP_CLASS_COL` in the next
# cell if they don't.

# %%
lookup_raw = pd.read_excel(LOOKUP_PATH)
print("Lookup columns:", list(lookup_raw.columns))
lookup_raw.head()

# %%
# ADJUST THESE TWO IF NEEDED, based on what printed above
LOOKUP_ID_COL = "raster_id"
LOOKUP_CLASS_COL = "CLASS"

lookup = pd.DataFrame(lookup_raw.drop(columns="geometry", errors="ignore"))
lookup[LOOKUP_ID_COL] = lookup[LOOKUP_ID_COL].astype(str)
lookup = lookup[[LOOKUP_ID_COL, LOOKUP_CLASS_COL]].drop_duplicates()

print("Lookup rows:", len(lookup))
lookup.head()

# %% [markdown]
# ## 3. Process each yearly CSV into (ORP_KOD, YEAR, <class columns>)

# %%
YEAR_PATTERN = re.compile(r"(\d{4})")


def process_year_file(csv_path):
    year_match = YEAR_PATTERN.search(os.path.basename(csv_path))
    if not year_match:
        raise ValueError(f"Couldn't find a 4-digit year in filename: {csv_path}")
    year = int(year_match.group(1))

    matrix = pd.read_csv(csv_path)
    matrix[ORP_ID_COL] = matrix[ORP_ID_COL].astype(str)

    long_df = matrix.melt(id_vars=ORP_ID_COL, var_name=LOOKUP_ID_COL, value_name="value")
    long_df[LOOKUP_ID_COL] = long_df[LOOKUP_ID_COL].astype(str)

    merged = long_df.merge(lookup, on=LOOKUP_ID_COL, how="left")

    missing = merged.loc[merged[LOOKUP_CLASS_COL].isna(), LOOKUP_ID_COL].unique()
    if len(missing):
        print(f"[{year}] WARNING: {len(missing)} raster_id(s) not found in lookup, e.g. {list(missing)[:10]}")

    grouped = merged.groupby([ORP_ID_COL, LOOKUP_CLASS_COL])["value"].mean().reset_index()
    wide = grouped.pivot(index=ORP_ID_COL, columns=LOOKUP_CLASS_COL, values="value").reset_index()
    wide["YEAR"] = year
    return wide


# %%
csv_files = sorted(glob.glob(os.path.join(YEARLY_TABLES_DIR, YEARLY_TABLES_GLOB)))
print(f"Found {len(csv_files)} yearly file(s):")
for f in csv_files:
    print(" -", os.path.basename(f))

if not csv_files:
    raise FileNotFoundError(
        f"No files matched {YEARLY_TABLES_GLOB} in {YEARLY_TABLES_DIR}. "
        "Check YEARLY_TABLES_DIR / YEARLY_TABLES_GLOB above."
    )

all_years = pd.concat([process_year_file(f) for f in csv_files], ignore_index=True)
print("Combined attribute table shape:", all_years.shape)
all_years.head()

# %% [markdown]
# ## 4. Join every year's attributes onto the geometry
#
# This produces one row per ORP per year (same geometry repeated across
# years) — the structure ArcGIS Online expects for time-enabling a layer
# on the `YEAR` field.

# %%
combined = gdf[[ORP_ID_COL, ORP_NAME_COL, "geometry"]].merge(all_years, on=ORP_ID_COL, how="inner")

print("Combined shape:", combined.shape)
print("Years included:", sorted(combined["YEAR"].unique()))
combined.head()

# %% [markdown]
# ## 5. Export the full-detail GeoJSON (no field name length limits here)

# %%
combined.to_file(GEOJSON_OUT, driver="GeoJSON")
print("Saved:", GEOJSON_OUT)

# %% [markdown]
# ## 6. Prep + export the AGOL-ready Shapefile
#
# Shapefiles cap field names at 10 characters, so class-name columns get
# auto-shortened here. A crosswalk CSV mapping short -> original names is
# saved alongside so meaning isn't lost — use it to relabel fields/legend
# after uploading to AGOL.

# %%
def make_shapefile_safe_names(columns):
    mapping = {}
    used = set()
    for col in columns:
        short = str(col)[:10]
        i = 1
        base_short = short
        while short in used:
            suffix = str(i)
            short = base_short[: 10 - len(suffix)] + suffix
            i += 1
        used.add(short)
        mapping[col] = short
    return mapping


protected_cols = [ORP_ID_COL, ORP_NAME_COL, "YEAR", "geometry"]
renamable_cols = [c for c in combined.columns if c not in protected_cols]

name_map = make_shapefile_safe_names(renamable_cols)
shp_ready = combined.rename(columns=name_map)

pd.DataFrame(list(name_map.items()), columns=["original_name", "shapefile_name"]).to_csv(
    FIELD_MAP_OUT, index=False
)
print("Field name mapping saved to:", FIELD_MAP_OUT)
shp_ready.head()

# %%
shp_ready.to_file(SHP_OUT, driver="ESRI Shapefile")

shp_base = os.path.splitext(SHP_OUT)[0]
shp_component_ext = [".shp", ".shx", ".dbf", ".prj", ".cpg"]

with zipfile.ZipFile(SHP_ZIP_OUT, "w", zipfile.ZIP_DEFLATED) as zf:
    for ext in shp_component_ext:
        component = shp_base + ext
        if os.path.exists(component):
            zf.write(component, arcname=os.path.basename(component))

print("Zipped shapefile ready for AGOL upload:", SHP_ZIP_OUT)

# %% [markdown]
# ## 7. Uploading to ArcGIS Online
#
# 1. In AGOL: Content -> New item -> Your device -> select
#    `ORP_AllYears_shapefile.zip` -> Publish as a hosted feature layer.
# 2. Once published, open the layer's Data tab and enable time on the
#    `YEAR` field (Settings -> enable "Time" -> Each feature has a single
#    time field -> choose `YEAR`) to get a working time slider.
# 3. Open `shapefile_field_name_mapping.csv` and rename the shortened
#    fields in AGOL (Layer settings -> Fields -> edit alias) back to their
#    original class names for a readable legend/popup.
