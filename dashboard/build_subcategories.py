import csv, json, pathlib

here = pathlib.Path(__file__).resolve().parent
zonal_dir = pathlib.Path("/sessions/amazing-hopeful-lamport/mnt/Instrumentalization/Outputs/ZonalStats")
lookup_path = pathlib.Path("/sessions/amazing-hopeful-lamport/mnt/Instrumentalization/Outputs/LookupTables_EN/KVES_KOD_lookup_MASTER_with_buckets.csv")

# raster_id -> {bucket, cz, en}
lookup = {}
with open(lookup_path, newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        bucket_en = row["BUCKET_EN"]
        bucket_key = {"Forest": "F", "Agricultural Land": "A", "Grassland": "G", "Urban Areas": "U"}.get(bucket_en)
        if bucket_key is None:
            continue  # excluded classes (wetland/aquatic/bare rock) -- not part of any featured bucket
        lookup[row["raster_id"]] = {
            "bucket": bucket_key,
            "cz": row["KATEGORIE"],
            "en": row["KATEGORIE_EN"],
        }

# per-ORP per-bucket raster_id -> pixel count, using the most recent year
# (land-cover classification is static across years in this dataset -- only
# the EI *score* per pixel varies year to year, confirmed by orp_data.json's
# "s" shares being identical across all years for a given ORP)
sub_by_orp = {}
national_sub = {"F": {}, "A": {}, "G": {}, "U": {}}
with open(zonal_dir / "ORP_KOD_EI_fullstats_2025.csv", newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        info = lookup.get(row["KOD"])
        if info is None:
            continue
        orp_kod = row["ORP_KOD"]
        count = int(row["count"])
        bucket = info["bucket"]
        rid = row["KOD"]
        sub_by_orp.setdefault(orp_kod, {"F": {}, "A": {}, "G": {}, "U": {}})
        sub_by_orp[orp_kod][bucket][rid] = sub_by_orp[orp_kod][bucket].get(rid, 0) + count
        national_sub[bucket][rid] = national_sub[bucket].get(rid, 0) + count

sub_by_orp["NATIONAL"] = national_sub

# merge into orp_data.json
data_path = here / "orp_data.json"
data = json.loads(data_path.read_text())
merged = 0
for kod, sub in sub_by_orp.items():
    if kod in data:
        data[kod]["sub"] = sub
        merged += 1

data_path.write_text(json.dumps(data, ensure_ascii=False))
print("merged sub-category breakdowns into", merged, "records")

# small static label table for the JS side (raster_id -> {cz, en}), scoped
# to only the classes that actually appear in a featured bucket
labels = {rid: {"cz": v["cz"], "en": v["en"]} for rid, v in lookup.items()}
(here / "subcat_labels.json").write_text(json.dumps(labels, ensure_ascii=False))
print("wrote", len(labels), "subcategory labels")
