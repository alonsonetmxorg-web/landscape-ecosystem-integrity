# Run this in your soilhealth conda env (has geopandas already).
# Reprojects the full 206-ORP boundary layer from EPSG:5514 to WGS84,
# simplifies it a bit for web use, and saves it back into the project folder.

import geopandas as gpd

SRC = "/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/Inputs/ORPs_Czechia.geojson"
OUT = "/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/Inputs/ORPs_Czechia_WGS84.geojson"

gdf = gpd.read_file(SRC)
gdf = gdf.to_crs(4326)

# light simplification to keep the web file small; tolerance is in degrees,
# ~0.0005 deg is roughly 50m, fine for a national-scale choropleth
gdf["geometry"] = gdf.geometry.simplify(0.0005, preserve_topology=True)

# keep just what the dashboard needs -- KOD is the field that matches
# ORP_KOD in all the zonal stats CSVs
gdf = gdf[["KOD", "NAZEV", "geometry"]]

gdf.to_file(OUT, driver="GeoJSON")
print(f"Saved {len(gdf)} ORPs to {OUT}")
