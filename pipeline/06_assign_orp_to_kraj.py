# Run this in your soilhealth conda env (has geopandas already).
# Spatially joins the 206 ORPs to their containing kraj (VUSC.geojson,
# EPSG:5514) using each ORP's centroid, and saves a simple KOD -> kraj
# lookup as JSON for the dashboard.

import json
import geopandas as gpd

ORP_PATH = "/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/Regional_Comparison/ORPs_simplified_wgs84.geojson"
VUSC_PATH = "/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/Regional_Comparison/VUSC.geojson"
OUT_PATH = "/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/Regional_Comparison/orp_to_kraj.json"

orps = gpd.read_file(ORP_PATH)          # already EPSG:4326
kraj = gpd.read_file(VUSC_PATH)         # EPSG:5514 (Czech Krovak)

# reproject kraj to match the ORPs' CRS (WGS84) -- this is the step that
# needs a real geodesy library (pyproj/GDAL) rather than a hand-rolled
# projection formula, since Krovak isn't a simple linear transform
kraj = kraj.to_crs(orps.crs)

orps["centroid"] = orps.geometry.centroid
orp_pts = orps.set_geometry("centroid")

joined = gpd.sjoin(orp_pts, kraj[["KOD", "NAZEV", "geometry"]], how="left", predicate="within")

result = {}
unresolved = []
for _, row in joined.iterrows():
    kod = row["KOD_left"] if "KOD_left" in row else row["KOD"]
    kraj_name = row.get("NAZEV_right") or row.get("NAZEV")
    kraj_kod = row.get("KOD_right")
    if kraj_name is None or (isinstance(kraj_name, float)):
        unresolved.append(kod)
        result[str(kod)] = None
    else:
        result[str(kod)] = {"kod": str(kraj_kod), "name": kraj_name}

with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=0)

print(f"Saved {len(result)} ORP->kraj assignments to {OUT_PATH}")
if unresolved:
    print(f"WARNING: {len(unresolved)} ORPs unresolved (centroid didn't land in any kraj -- "
          f"can happen right at a boundary): {unresolved}")
else:
    print("All 206 ORPs resolved to a kraj.")

from collections import Counter
counts = Counter(v["name"] for v in result.values() if v)
for name, c in sorted(counts.items(), key=lambda x: -x[1]):
    print(f"  {name}: {c} ORPs")
