import json

def perpendicular_distance(pt, line_start, line_end):
    x, y = pt
    x1, y1 = line_start
    x2, y2 = line_end
    if x1 == x2 and y1 == y2:
        return ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
    num = abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1)
    den = ((y2 - y1) ** 2 + (x2 - x1) ** 2) ** 0.5
    return num / den

def douglas_peucker(points, epsilon):
    if len(points) < 3:
        return points
    dmax = 0.0
    index = 0
    for i in range(1, len(points) - 1):
        d = perpendicular_distance(points[i], points[0], points[-1])
        if d > dmax:
            index = i
            dmax = d
    if dmax > epsilon:
        left = douglas_peucker(points[:index + 1], epsilon)
        right = douglas_peucker(points[index:], epsilon)
        return left[:-1] + right
    else:
        return [points[0], points[-1]]

def simplify_ring(ring, epsilon):
    # ring is a closed loop (first point == last point); keep it closed
    if len(ring) < 5:
        return ring
    simplified = douglas_peucker(ring, epsilon)
    if len(simplified) < 4:
        return ring  # simplification degenerated a small ring -- keep original
    return simplified

def simplify_geometry(geom, epsilon):
    if geom["type"] == "Polygon":
        geom["coordinates"] = [simplify_ring(ring, epsilon) for ring in geom["coordinates"]]
    elif geom["type"] == "MultiPolygon":
        geom["coordinates"] = [
            [simplify_ring(ring, epsilon) for ring in poly]
            for poly in geom["coordinates"]
        ]
    return geom

def count_pts(c):
    if isinstance(c[0], (int, float)):
        return 1
    return sum(count_pts(cc) for cc in c)

if __name__ == "__main__":
    import sys
    src = "/sessions/amazing-hopeful-lamport/mnt/uploads/ORPs_WGS84.geojson"
    with open(src, encoding="utf-8") as f:
        d = json.load(f)

    for eps in [0.0005, 0.0008, 0.0012, 0.002]:
        total_before = sum(count_pts(f["geometry"]["coordinates"]) for f in d["features"])
        import copy
        d2 = copy.deepcopy(d)
        for feat in d2["features"]:
            simplify_geometry(feat["geometry"], eps)
        total_after = sum(count_pts(f["geometry"]["coordinates"]) for f in d2["features"])
        print(f"epsilon={eps}: {total_before} -> {total_after} points ({100*total_after/total_before:.1f}%)")
