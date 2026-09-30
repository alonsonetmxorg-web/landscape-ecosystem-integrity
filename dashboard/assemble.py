import json, pathlib

here = pathlib.Path(__file__).resolve().parent
data_dir = here / "data"
out_dir = here  # writes the assembled HTML next to this script

geom = (data_dir / "ORPs_simplified_wgs84.geojson").read_text()
data = (data_dir / "orp_data.json").read_text()
neighbors = (data_dir / "neighbors.json").read_text()
region = (data_dir / "orp_to_kraj.json").read_text()
template = (here / "dashboard_template.html").read_text()
logic = (here / "dashboard_logic.js").read_text()

html = template.replace("__GEOM_JSON__", geom)
html = html.replace("__DATA_JSON__", data)
html = html.replace("__NEIGHBORS_JSON__", neighbors)
html = html.replace("__REGION_JSON__", region)
html = html.replace('<script src="dashboard_logic.js"></script>', "<script>\n" + logic + "\n</script>")

out_path = out_dir / "landscape_health_dashboard_v2.html"
out_path.write_text(html)
print("Wrote", len(html), "bytes to", out_path)
print("(pin_logo_white.png and tour_images/ must sit next to the output HTML -- already true here.)")
