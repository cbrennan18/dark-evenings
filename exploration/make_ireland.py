"""Build docs/data/ireland.json: the island of Ireland, simplified, for the hook.

Source: Natural Earth 1:10m admin-0 map subunits (public domain).
The admin-0 "Ireland" polygon is the Republic only; Northern Ireland sits
inside the UK, so both the "Ireland" and "Northern Ireland" subunits are used.

Usage: python3 exploration/make_ireland.py [CACHE_DIR]
  CACHE_DIR holds the downloaded GeoJSON (default: ./exploration/.cache, gitignored
  if you add it; pass a scratch dir to keep the repo clean).
"""
import datetime
import json
import os
import sys
import urllib.request

URL = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
       "geojson/ne_10m_admin_0_map_subunits.geojson")
SUBUNITS = {"Ireland", "Northern Ireland"}
TOLERANCE = 0.015     # degrees, Ramer-Douglas-Peucker
MIN_AREA = 0.002      # square degrees; smaller islets are dropped
DECIMALS = 3
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "data", "ireland.json")


def rdp(pts, eps):
    """Ramer-Douglas-Peucker on an open polyline (iterative)."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        norm = dx * dx + dy * dy
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if norm == 0:
                d = ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / norm))
                d = ((px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2) ** 0.5
            if d > best:
                best, idx = d, i
        if best > eps:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(pts, keep) if k]


def area(ring):
    s = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        s += x0 * y1 - x1 * y0
    return abs(s) / 2


def main():
    cache = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), ".cache")
    os.makedirs(cache, exist_ok=True)
    src = os.path.join(cache, "ne_10m_admin_0_map_subunits.geojson")
    if not os.path.exists(src):
        urllib.request.urlretrieve(URL, src)
    with open(src, encoding="utf-8") as f:
        data = json.load(f)

    polygons, raw_points = [], 0
    for feat in data["features"]:
        if feat["properties"].get("SUBUNIT") not in SUBUNITS:
            continue
        geom = feat["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        for poly in polys:
            ring = [tuple(p[:2]) for p in poly[0]]  # exterior ring only
            raw_points += len(ring)
            if area(ring) < MIN_AREA:
                continue
            closed = ring[:-1] if ring[0] == ring[-1] else ring
            simp = rdp(closed + [closed[0]], TOLERANCE)[:-1]
            simp = [[round(x, DECIMALS), round(y, DECIMALS)] for x, y in simp]
            if len(simp) >= 3:
                polygons.append(simp)

    xs = [p[0] for poly in polygons for p in poly]
    ys = [p[1] for poly in polygons for p in poly]
    out = {
        "source": "Natural Earth 1:10m admin-0 map subunits (Ireland + Northern Ireland)",
        "url": URL,
        "licence": "Public domain (Natural Earth, naturalearthdata.com/about/terms-of-use)",
        "generated": datetime.date.today().isoformat(),
        "simplification": "Ramer-Douglas-Peucker, tolerance %s deg, %d dp, exterior rings, islets < %s sq deg dropped" % (TOLERANCE, DECIMALS, MIN_AREA),
        "bbox": [min(xs), min(ys), max(xs), max(ys)],
        "polygons": polygons,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print("polygons %d, points %d -> %d, %d bytes, bbox %s" % (
        len(polygons), raw_points, sum(len(p) for p in polygons), os.path.getsize(OUT), out["bbox"]))


if __name__ == "__main__":
    main()
