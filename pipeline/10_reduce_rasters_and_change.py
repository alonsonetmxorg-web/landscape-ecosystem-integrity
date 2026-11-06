"""
10 -- Reduce the yearly rasters to the 25 m (zoom-12) grid, histograms, and the
      change rasters used to choose the colour breaks.

What it does, in order
  1. REDUCE   every yearly raster (e.g. EI_2017.tif ... EI_2025.tif, ~10 m,
              ~3.85 GB each) is averaged down to the zoom-12 pixel size in
              Web Mercator (38.2 m in EPSG:3857 = about 25 m on the ground at
              Czech latitudes), same grid for every year (-tap), values kept as
              Float32 (NO rescaling, NO classes), ZSTD compressed.
  2. HISTOGRAMS  one histogram + percentile table per reduced year, and a
              plot of all years (outputs/histograms/).
  3. CHANGE   from the reduced rasters, two change rasters in percentage
              points (the index is 0-1, so x100):
                - change_<first>_<last>_pp.tif     last year - first year
                - trend_slope_pp_per_year.tif      OLS slope over all years
  4. BREAKS   histogram + percentiles of each change raster, and the table
              "which value does each of the 7 colours sit at" for candidate
              symmetric ranges M, plus a PNG with the colour positions drawn
              over the histogram. Send outputs/change/ to the person who
              decides the colour breaks.

Colour positions follow the colleagues' colour spec: 7 stops at 0, 1/6, 2/6,
1/2, 4/6, 5/6, 1 of the ramp -M..+M (zero white, in the middle):
  value_at_stop = M * (2 * position - 1)

Needs: numpy, rasterio, matplotlib, and the GDAL command-line tool `gdalwarp`
(see ../requirements.txt; GDAL from conda: conda install -c conda-forge gdal).

Run:  python 10_reduce_rasters_and_change.py
Edit the CONFIGURATION block first.
"""
import csv
import re
import subprocess
import time
from pathlib import Path

import numpy as np

# ==========================================================
# CONFIGURATION
# ==========================================================
INPUT_DIR = Path("/Users/alonso.gonzalez.glez/Downloads")     # folder with the original yearly rasters
YEAR_GLOB = "EI_*.tif"                                        # one file per year; the 4-digit year is read from the name
OUTPUT_DIR = Path("/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/Outputs/Reduced")

# Zoom-12 pixel size in Web Mercator metres: 156543.03392804097 / 2**12.
# About 38.2 m in EPSG:3857 = about 25 m on the ground at 50 deg N.
TARGET_RES = 156543.03392804097 / 2 ** 12

# NoData of the ORIGINAL rasters. Leave None to read it from each file; if the
# files carry no NoData tag but use a value such as -9999, set it here.
SRC_NODATA_OVERRIDE = None
DST_NODATA = -9999.0

# Level histograms (index is 0-1)
LEVEL_RANGE = (0.0, 1.0)
LEVEL_BINS = 1000

# Change rasters are in percentage points (index x 100)
CHANGE_RANGE = (-100.0, 100.0)    # first-last change can't exceed +/-100 p.p.
CHANGE_BINS = 4000                # 0.05 p.p. per bin
SLOPE_RANGE = (-25.0, 25.0)       # p.p. per year
SLOPE_BINS = 2000                 # 0.025 p.p./yr per bin

BLOCK = 2048                      # pixels per side per processing window

# Colour stops of the change scale (colleagues' spec): position along the ramp
STOP_POSITIONS = [0.0, 1 / 6, 2 / 6, 0.5, 4 / 6, 5 / 6, 1.0]
STOP_COLOURS = ["#B54836", "#CE8579", "#E6C2BC", "#FFFFFF", "#BBCFE2", "#769EC5", "#326EA8"]
# Extra symmetric ranges M (in the unit of the change raster) to tabulate, on top of the data-driven ones
EXTRA_M = {"change": [10.0, 20.0, 30.0], "slope": [1.0, 2.0, 3.0]}

_t0 = time.perf_counter()


def log(msg):
    print(f"[{time.perf_counter() - _t0:8.1f}s] {msg}", flush=True)


# ==========================================================
# Pure numpy helpers (no GDAL needed; unit-testable)
# ==========================================================
def hist_edges(rng, bins):
    return np.linspace(rng[0], rng[1], bins + 1)


def percentiles_from_hist(counts, edges, qs):
    """Percentiles (0-100) from a histogram by linear interpolation inside the bin."""
    counts = np.asarray(counts, dtype=np.float64)
    total = counts.sum()
    if total == 0:
        return {q: float("nan") for q in qs}
    cum = np.cumsum(counts)
    out = {}
    for q in qs:
        target = total * q / 100.0
        i = int(np.searchsorted(cum, target, side="left"))
        i = min(i, len(counts) - 1)
        prev = cum[i - 1] if i > 0 else 0.0
        frac = 0.0 if counts[i] == 0 else (target - prev) / counts[i]
        out[q] = float(edges[i] + frac * (edges[i + 1] - edges[i]))
    return out


def stop_values(M):
    """Value at which each of the 7 colours sits for the symmetric range [-M, +M]."""
    return [M * (2.0 * p - 1.0) for p in STOP_POSITIONS]


def share_within(counts, edges, M):
    """Share of pixels with |value| <= M (histogram resolution)."""
    counts = np.asarray(counts, dtype=np.float64)
    total = counts.sum()
    if total == 0:
        return float("nan")
    centres = (edges[:-1] + edges[1:]) / 2.0
    return float(counts[np.abs(centres) <= M].sum() / total)


def candidate_ms(counts, edges, extra):
    """Data-driven symmetric ranges, plus the extra ones from the configuration."""
    p = percentiles_from_hist(counts, edges, [0.5, 1, 2.5, 97.5, 99, 99.5])
    ms = {
        "covers_95pct (p2.5/p97.5)": max(abs(p[2.5]), abs(p[97.5])),
        "covers_98pct (p1/p99)": max(abs(p[1]), abs(p[99])),
        "covers_99pct (p0.5/p99.5)": max(abs(p[0.5]), abs(p[99.5])),
    }
    for m in extra:
        ms[f"fixed_{m:g}"] = float(m)
    return ms


# ==========================================================
# Step 1 -- reduce
# ==========================================================
YEAR_RE = re.compile(r"(20\d{2})")


def find_year_files():
    out = []
    pat = Path(YEAR_GLOB)
    base = pat.parent if pat.is_absolute() else INPUT_DIR   # accepts a bare name/pattern or a full path
    for f in sorted(base.glob(pat.name)):
        m = YEAR_RE.search(f.name)
        if m:
            out.append((int(m.group(1)), f))
    if not out:
        raise SystemExit(f"No files matching {YEAR_GLOB} in {INPUT_DIR}")
    years = [y for y, _ in out]
    if len(set(years)) != len(years):
        raise SystemExit(f"More than one file for the same year: {years}")
    return sorted(out)


def reduce_all(year_files):
    import rasterio
    reduced = []
    out_dir = OUTPUT_DIR / "reduced"
    out_dir.mkdir(parents=True, exist_ok=True)
    for year, src in year_files:
        dst = out_dir / f"{src.stem}_25m_3857.tif"
        reduced.append((year, dst))
        if dst.exists():
            log(f"{year}: already reduced, skipping ({dst.name})")
            continue
        with rasterio.open(src) as r:
            nodata = SRC_NODATA_OVERRIDE if SRC_NODATA_OVERRIDE is not None else r.nodata
        if nodata is None:
            nodata = DST_NODATA
            log(f"{year}: source has no NoData tag, assuming {nodata}")
        cmd = [
            "gdalwarp", "-overwrite", "-t_srs", "EPSG:3857",
            "-tr", f"{TARGET_RES}", f"{TARGET_RES}", "-tap",
            "-r", "average", "-ot", "Float32",
            "-srcnodata", str(nodata), "-dstnodata", str(DST_NODATA),
            "-multi", "-wo", "NUM_THREADS=ALL", "-wm", "2048",
            "-co", "COMPRESS=ZSTD", "-co", "PREDICTOR=3", "-co", "TILED=YES", "-co", "BIGTIFF=IF_SAFER",
            str(src), str(dst),
        ]
        log(f"{year}: reducing {src.name} -> {dst.name}")
        subprocess.run(cmd, check=True)
        log(f"{year}: done, {dst.stat().st_size / 1e6:.0f} MB")
    return reduced


# ==========================================================
# Step 2 -- level histograms
# ==========================================================
def block_windows(width, height, block):
    from rasterio.windows import Window
    for r in range(0, height, block):
        for c in range(0, width, block):
            yield Window(c, r, min(block, width - c), min(block, height - r))


def histogram_of_raster(path, rng, bins):
    import rasterio
    edges = hist_edges(rng, bins)
    counts = np.zeros(bins, dtype=np.int64)
    below = above = valid_n = 0
    vmin, vmax, vsum = np.inf, -np.inf, 0.0
    with rasterio.open(path) as r:
        nd = r.nodata
        for w in block_windows(r.width, r.height, BLOCK):
            a = r.read(1, window=w).astype(np.float64)
            ok = np.isfinite(a)
            if nd is not None:
                ok &= a != nd
            v = a[ok]
            if v.size == 0:
                continue
            valid_n += v.size
            vmin, vmax, vsum = min(vmin, v.min()), max(vmax, v.max()), vsum + v.sum()
            below += int((v < rng[0]).sum())
            above += int((v > rng[1]).sum())
            c, _ = np.histogram(v, bins=edges)
            counts += c
    stats = {"valid_pixels": valid_n, "min": vmin, "max": vmax, "mean": vsum / valid_n if valid_n else float("nan"),
             "below_range": below, "above_range": above}
    return counts, edges, stats


def write_hist_csv(path, counts, edges):
    total = counts.sum()
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["bin_left", "bin_right", "count", "share"])
        for i, c in enumerate(counts):
            w.writerow([f"{edges[i]:.6f}", f"{edges[i + 1]:.6f}", int(c), f"{(c / total if total else 0):.8f}"])


PCTS = [0.5, 1, 2.5, 5, 10, 25, 50, 75, 90, 95, 97.5, 99, 99.5]


def level_histograms(reduced):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    hdir = OUTPUT_DIR / "histograms"
    hdir.mkdir(parents=True, exist_ok=True)
    rows = []
    fig, ax = plt.subplots(figsize=(9, 5))
    for year, path in reduced:
        log(f"{year}: histogram")
        counts, edges, st = histogram_of_raster(path, LEVEL_RANGE, LEVEL_BINS)
        write_hist_csv(hdir / f"hist_{year}.csv", counts, edges)
        p = percentiles_from_hist(counts, edges, PCTS)
        rows.append([year, st["valid_pixels"], st["min"], st["max"], st["mean"]] + [p[q] for q in PCTS])
        ax.plot((edges[:-1] + edges[1:]) / 2, counts / max(counts.sum(), 1), lw=1, label=str(year))
    ax.set_xlabel("value (index 0-1)")
    ax.set_ylabel("share of pixels per bin")
    ax.set_title("Distribution of the reduced yearly rasters")
    ax.legend(ncol=3, fontsize=8)
    fig.tight_layout()
    fig.savefig(hdir / "histograms_all_years.png", dpi=150)
    plt.close(fig)
    with open(hdir / "percentiles_by_year.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["year", "valid_pixels", "min", "max", "mean"] + [f"p{q:g}" for q in PCTS])
        for r in rows:
            w.writerow([r[0], r[1]] + [f"{x:.6f}" for x in r[2:]])
    log(f"histograms written to {hdir}")


# ==========================================================
# Step 3 -- change rasters (percentage points)
# ==========================================================
def make_change_rasters(reduced):
    import rasterio
    if len(reduced) < 2:
        log("Change rasters need at least 2 years; skipping (only one year found).")
        return None
    cdir = OUTPUT_DIR / "change"
    cdir.mkdir(parents=True, exist_ok=True)
    years = [y for y, _ in reduced]
    first, last = years[0], years[-1]
    change_path = cdir / f"change_{first}_{last}_pp.tif"
    slope_path = cdir / "trend_slope_pp_per_year.tif"

    srcs = [rasterio.open(p) for _, p in reduced]
    shapes = {(s.width, s.height) for s in srcs}
    if len(shapes) != 1:
        raise SystemExit(f"Reduced rasters do not share one grid: {shapes}. Check the originals have the same extent.")
    profile = srcs[0].profile.copy()
    profile.update(dtype="float32", count=1, nodata=DST_NODATA, compress="ZSTD", predictor=3, tiled=True,
                   BIGTIFF="IF_SAFER")
    profile.pop("blockxsize", None)
    profile.pop("blockysize", None)
    profile.update(blockxsize=512, blockysize=512)

    x = np.array(years, dtype=np.float64)
    xc = x - x.mean()
    sxx = float((xc ** 2).sum())
    ch_edges, sl_edges = hist_edges(CHANGE_RANGE, CHANGE_BINS), hist_edges(SLOPE_RANGE, SLOPE_BINS)
    ch_counts = np.zeros(CHANGE_BINS, dtype=np.int64)
    sl_counts = np.zeros(SLOPE_BINS, dtype=np.int64)

    with rasterio.open(change_path, "w", **profile) as dch, rasterio.open(slope_path, "w", **profile) as dsl:
        wins = list(block_windows(srcs[0].width, srcs[0].height, BLOCK))
        for k, w in enumerate(wins, 1):
            stack = np.stack([s.read(1, window=w).astype(np.float64) for s in srcs], axis=0)
            nd = srcs[0].nodata
            valid = np.all(np.isfinite(stack), axis=0)
            if nd is not None:
                valid &= np.all(stack != nd, axis=0)
            stack = np.where(valid[None], stack, 0.0)
            change = (stack[-1] - stack[0]) * 100.0
            slope = np.tensordot(xc, stack, axes=(0, 0)) / sxx * 100.0
            out_ch = np.where(valid, change, DST_NODATA).astype("float32")
            out_sl = np.where(valid, slope, DST_NODATA).astype("float32")
            dch.write(out_ch, 1, window=w)
            dsl.write(out_sl, 1, window=w)
            if valid.any():
                c, _ = np.histogram(change[valid], bins=ch_edges)
                ch_counts += c
                s_, _ = np.histogram(slope[valid], bins=sl_edges)
                sl_counts += s_
            if k % 20 == 0 or k == len(wins):
                log(f"change rasters: block {k}/{len(wins)}")
    for s in srcs:
        s.close()
    return {
        "change": (change_path, ch_counts, ch_edges, f"Change {first}-{last} (percentage points)"),
        "slope": (slope_path, sl_counts, sl_edges, f"OLS trend slope {first}-{last} (percentage points per year)"),
    }


# ==========================================================
# Step 4 -- histogram, percentiles and colour breaks of the change rasters
# ==========================================================
def change_breaks(results):
    if not results:
        return
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    cdir = OUTPUT_DIR / "change"
    for key, (path, counts, edges, title) in results.items():
        write_hist_csv(cdir / f"hist_{key}.csv", counts, edges)
        p = percentiles_from_hist(counts, edges, PCTS)
        with open(cdir / f"percentiles_{key}.csv", "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["percentile", "value"])
            for q in PCTS:
                w.writerow([q, f"{p[q]:.4f}"])
        ms = candidate_ms(counts, edges, EXTRA_M[key])
        with open(cdir / f"colour_breaks_{key}.csv", "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["range_M", "M_value", "share_of_pixels_within_+-M"] +
                       [f"stop{i + 1}_{c}_at_{pos:.4f}" for i, (c, pos) in enumerate(zip(STOP_COLOURS, STOP_POSITIONS))])
            for name, M in ms.items():
                w.writerow([name, f"{M:.4f}", f"{share_within(counts, edges, M):.4f}"] + [f"{v:.4f}" for v in stop_values(M)])
        # plot: histogram (log y) + colour stops for the data-driven 98 % range
        main_M = ms["covers_98pct (p1/p99)"]
        centres = (edges[:-1] + edges[1:]) / 2
        fig, ax = plt.subplots(figsize=(10, 5.5))
        ax.bar(centres, counts / max(counts.sum(), 1), width=edges[1] - edges[0], color="#63716D", lw=0)
        ax.set_yscale("log")
        lim = max(main_M * 1.6, 1e-6)
        ax.set_xlim(-lim, lim)
        for v, col in zip(stop_values(main_M), STOP_COLOURS):
            ax.axvline(v, color=col if col != "#FFFFFF" else "#999999", lw=2.2)
            ax.text(v, ax.get_ylim()[1], f"{v:.2f}", rotation=90, va="top", ha="right", fontsize=8)
        ax.set_xlabel(title)
        ax.set_ylabel("share of pixels (log scale)")
        ax.set_title(f"Where the 7 colours sit for M = +-{main_M:.2f} (covers 98 % of pixels)")
        fig.tight_layout()
        fig.savefig(cdir / f"histogram_{key}.png", dpi=150)
        plt.close(fig)
        log(f"{key}: M candidates {', '.join(f'{k}={v:.3f}' for k, v in ms.items())}")
    log(f"send the folder {cdir} to whoever decides the colour breaks")


# ==========================================================
def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    year_files = find_year_files()
    log(f"{len(year_files)} yearly rasters: {[y for y, _ in year_files]}")
    reduced = reduce_all(year_files)
    level_histograms(reduced)
    results = make_change_rasters(reduced)
    change_breaks(results)
    log("all done")


if __name__ == "__main__":
    main()
