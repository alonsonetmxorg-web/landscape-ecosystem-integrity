# Landscape Ecosystem Integrity Dashboard

A bilingual (CZ/EN) dashboard showing Ecosystem Integrity (RIEI) for every
ORP (municipality with extended competence) in the Czech Republic,
2017–2025. Built by Člověk v tísni / People in Need. Methodology:
Zelený, J., Mercado-Bettín, D., & Müller, F. (2021). *Towards the
evaluation of regional ecosystem integrity using NDVI, brightness
temperature and surface heterogeneity.* Science of the Total Environment,
796, Article 148994. https://doi.org/10.1016/j.scitotenv.2021.148994

This repo exists so a new engineer can understand and rebuild the whole
system without needing the original ~170GB of raw/intermediate raster data
on their machine. That data never lives in this repo (see **What's not
here** below) — only the code that produces it, and the small processed
outputs the live dashboard actually needs.

## How it all fits together

```
Satellite imagery (Sentinel/Landsat-derived yearly composites)
        |
        |  (not in this repo -- see "What's not here")
        v
Yearly per-pixel indicator rasters (2017-2025):
  photosynthetic potential, cooling capacity, landscape heterogeneity
        |
        v
pipeline/01_rasterize_kves_national.py   -- land-cover class raster (KVES)
pipeline/02_zonal_stats_national.py      -- ORP x land-cover-class x year
                                              zonal means  ->  CSVs
pipeline/02b_warp_to_reference_large.py  -- (helper: memory-safe raster warp)
pipeline/03_ei_trend_full_resolution.py  -- per-pixel 2017-2025 trend
                                              (slope/p-value/R^2 rasters)
pipeline/04_trend_regression_per_class.py-- per-ORP, per-class trend (CSV)
        |
        v
pipeline/05_reproject_orps_to_wgs84.py   -- ORP boundaries -> WGS84, simplified
pipeline/06_assign_orp_to_kraj.py        -- ORP -> kraj (region) lookup
pipeline/07_orp_multiyear_to_agol.py     -- combine all years -> one GeoJSON
                                              + Shapefile for ArcGIS Online
        |
        v
   +---------------------------+   +--------------------------------+
   | 4 layers hosted on        |   | "Trend" layer: self-hosted      |
   | ArcGIS Online as tile     |   | static XYZ tiles (PNG), built   |
   | services (Esri account)   |   | by pipeline/08 + 09 and served  |
   |  - health                 |   | via GitHub Pages, since AGOL    |
   |  - photo                  |   | couldn't serve a continuous     |
   |  - cooling                |   | zero-centered gradient the way  |
   |  - hetero                 |   | the dashboard needed.           |
   +---------------------------+   +--------------------------------+
        |                                       |
        +-------------------+-------------------+
                             v
              dashboard/ (this repo, see below)
                             |
                             v
              landscape_health_dashboard_v2.html
              (single self-contained file -- open it directly,
               no server/database required)
```

**There is no live database or backend.** The dashboard is one static HTML
file. All 206 ORPs' per-year, per-category values are embedded directly in
it as JSON (built from `dashboard/data/orp_data.json`, itself built from
the zonal-stats CSVs). The four ArcGIS-hosted rasters and the GitHub
Pages-hosted trend tiles are the only things it fetches over the network
at runtime.

## Repo structure

- **`pipeline/`** — the raster/stats processing scripts, roughly in the
  order you'd run them (numbered). Several are written as `# %%`
  cell-blocks (VS Code / Jupyter / Spyder all recognize this) rather than
  plain scripts, since they were developed interactively against
  multi-GB rasters.
- **`dashboard/`** — everything needed to rebuild the actual dashboard
  file:
  - `assemble.py` — reads `dashboard_template.html` + `dashboard_logic.js`
    + the JSON/GeoJSON files in `data/`, and writes the single
    self-contained `landscape_health_dashboard_v2.html`.
  - `dashboard_template.html` / `dashboard_logic.js` — the actual
    dashboard source (HTML/CSS/Leaflet+Chart.js).
  - `data/` — small (a few MB total) processed outputs: ORP boundaries,
    per-ORP per-year index values, region lookups, sub-category labels.
    This is the "database" — small enough to version normally, and it's
    what a new engineer needs to get a *working* dashboard immediately,
    without re-running the full pipeline against the raw rasters first.
  - `tour_images/` — the photos used in the "raster tour" feature.
  - `simplify.py`, `build_subcategories.py`, `stats_utils.py` — helper
    scripts used once while building `data/` (geometry simplification,
    sub-category breakdown, a dependency-free t-distribution p-value
    implementation).

## Rebuilding the dashboard (fast path — no raw raster data needed)

```bash
cd dashboard
python assemble.py
```

This regenerates `landscape_health_dashboard_v2.html` from the files
already in `dashboard/`, in seconds. Open the resulting file directly in
a browser — that's the whole deploy. To change dashboard behavior/text,
edit `dashboard_template.html` (structure/CSS) or `dashboard_logic.js`
(everything else), then re-run `assemble.py`.

## Rebuilding the data from scratch (needs the raw rasters)

1. Set up the environment (see **Setup** below).
2. Run `pipeline/` scripts in numeric order against the raw yearly
   indicator rasters. Each script's own docstring/markdown cell explains
   its exact inputs/outputs and where to point its config paths.
3. `pipeline/07_orp_multiyear_to_agol.py` produces the GeoJSON/Shapefile
   to re-upload to ArcGIS Online for the 4 hosted raster layers (manual
   step in the AGOL web UI/ArcGIS Pro — not scripted here).
4. `pipeline/08_rebuild_trend_tiles.ipynb` + `09_publish_trend_tiles.sh`
   regenerate and republish the self-hosted "trend" tile pyramid.
5. The zonal-stats CSVs these scripts produce feed into a final step
   (not yet scripted — currently done ad hoc) that builds
   `dashboard/data/orp_data.json` in the exact shape `dashboard_logic.js`
   expects. **This is the main gap a new engineer should close first**
   if the raw data pipeline changes: turn that step into a proper script
   rather than a one-off.

## What's not here

- **Raw/intermediate rasters** (hundreds of GB): the yearly composite
  rasters, warped/reprojected copies, the national land-cover raster, the
  full-resolution trend rasters, and any tile pyramid before publishing.
  All regenerable via `pipeline/` — nothing here is a one-way process.
- **The very first step** — deriving the yearly photosynthetic
  potential / cooling capacity / heterogeneity rasters from raw satellite
  imagery — isn't in this repo. It almost certainly lives in whatever
  Jakub Zelený used for the methodology paper (Google Earth Engine is a
  reasonable guess given the indicators involved, but this hasn't been
  confirmed). Worth tracking down and adding here so the pipeline is
  truly end-to-end.
- **GitHub credentials / ArcGIS Online login** — obviously not committed
  anywhere; `pipeline/09_publish_trend_tiles.sh` and the ArcGIS upload
  step both need your own accounts.

## Setup

```bash
conda create -n landscape-ei python=3.11
conda activate landscape-ei
conda install -c conda-forge gdal    # gdalwarp / gdaldem / gdal2tiles.py -- not a pip package
pip install -r requirements.txt
```

`dashboard/assemble.py` needs nothing beyond the Python standard library
(no environment required to just rebuild the dashboard file).

## Credits

Člověk v tísni / People in Need — Jakub Zelený (methodology lead,
jakub.zeleny@peopleinneed.net), Alonso Gonzalez (engineering), Vojtěch
Andrš (GIS), Natálie Marsh (geocoding), Marcela Vorlíčková (UI), Klára
Petrásková (project coordination).
