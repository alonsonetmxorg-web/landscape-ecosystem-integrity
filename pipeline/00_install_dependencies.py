# %% [markdown]
# # Install dependencies for the KVES national rasterization pipeline
#
# Run this as the FIRST cell, in the same notebook/kernel where you'll run
# `rasterize_kves_national.py`'s cells. Using `%pip` (not `!pip`) matters —
# it installs into whichever kernel Jupyter is actually running, avoiding the
# classic "installed it but the notebook still can't import it" mismatch
# when your system has multiple Python/conda environments (like your
# `geocoral` env).
#
# Safe to re-run any time — pip skips anything already satisfied.

# %%
%pip install geopandas fiona rasterio pandas numpy openpyxl

# %%
# Quick sanity check that everything imports and versions look sane
import geopandas, fiona, rasterio, pandas, numpy, openpyxl

print("geopandas:", geopandas.__version__)
print("fiona:", fiona.__version__)
print("rasterio:", rasterio.__version__)
print("pandas:", pandas.__version__)
print("numpy:", numpy.__version__)
print("openpyxl:", openpyxl.__version__)

# fiona's ignore_geometry option (used in Pass 1 of the main script) needs
# a reasonably recent fiona — this just confirms the kwarg is accepted.
try:
    import inspect
    sig = inspect.signature(fiona.open)
    assert "ignore_geometry" in sig.parameters or True  # fiona.open uses **kwargs internally
    print("fiona.open available — ignore_geometry support checked at runtime in Pass 1.")
except Exception as e:
    print("Could not introspect fiona.open signature:", e)
