#!/usr/bin/env bash
# Publishes the "trend" raster tile pyramid (produced by
# 08_rebuild_trend_tiles.ipynb) to GitHub Pages, at the exact URL structure
# dashboard/dashboard_logic.js expects: RASTER_TILE_URLS.trend points at
# https://<github-username>.github.io/<repo>/{z}/{x}/{y}.png
#
# Usage: edit TILES_DIR below to wherever your rebuilt tiles/ folder is,
# then run this once per re-publish. This repo (the tiles repo) is
# deliberately SEPARATE from the code repo you're reading this from --
# GitHub Pages serves it at a stable URL, and it's pure generated pixel
# data (gigabytes of small PNGs), not something to version alongside the
# actual pipeline/dashboard source code.
set -euo pipefail

TILES_DIR="/path/to/your/tiles"   # <-- the folder gdal2tiles.py wrote (contains {z}/{x}/{y}.png)
REMOTE_URL="git@github.com:alonsonetmxorg-web/tiles.git"  # <-- your GitHub Pages tiles repo

cd "$TILES_DIR"

if [ ! -d .git ]; then
  git init
  git branch -M main
  git remote add origin "$REMOTE_URL"
  # GitHub Pages runs Jekyll by default, which can choke on/ignore folders
  # with certain naming patterns and slows down publishing a lot with this
  # many small files -- this file disables that.
  touch .nojekyll
fi

git add .
git commit -m "Republish EI trend tile pyramid"
git push -u origin main
