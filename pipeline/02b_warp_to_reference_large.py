# %% [markdown]
# # Memory-safe warp of a large raster onto a reference grid
#
# Use this instead of a plain rasterio.warp.reproject() call when the source
# raster is large (multi-GB) — WarpedVRT computes the warp lazily and this
# writes it out window-by-window, so memory use stays bounded regardless of
# the source file's size, instead of loading full arrays into RAM.

# %%
from pathlib import Path
import rasterio
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
from rasterio.windows import Window


def warp_to_reference_large(src_path, reference_path, dst_path,
                             resampling=Resampling.bilinear,
                             block_size=2048):
    """
    Warp src_path onto the exact CRS + transform + dimensions of
    reference_path, writing the output in blocks so memory use doesn't
    scale with the source file's size.

    resampling: Resampling.nearest for categorical rasters (e.g. KVES),
                Resampling.bilinear/.cubic for continuous rasters (e.g. an
                ecosystem-health index).
    """
    with rasterio.open(reference_path) as ref:
        ref_crs = ref.crs
        ref_transform = ref.transform
        ref_width = ref.width
        ref_height = ref.height
        ref_dtype = ref.dtypes[0]

    with rasterio.open(src_path) as src:
        print(f"Source: {src.width}x{src.height}, crs={src.crs}")
        print(f"Reference/target: {ref_width}x{ref_height}, crs={ref_crs}")

        with WarpedVRT(
            src,
            crs=ref_crs,
            transform=ref_transform,
            width=ref_width,
            height=ref_height,
            resampling=resampling,
        ) as vrt:
            profile = vrt.profile.copy()
            profile.update({
                "driver": "GTiff",
                "compress": "LZW",
                "tiled": True,
                "blockxsize": block_size,
                "blockysize": block_size,
                "BIGTIFF": "IF_SAFER",
                "dtype": ref_dtype,
            })

            with rasterio.open(dst_path, "w", **profile) as dst:
                for j in range(0, ref_height, block_size):
                    h = min(block_size, ref_height - j)
                    for i in range(0, ref_width, block_size):
                        w = min(block_size, ref_width - i)
                        window = Window(i, j, w, h)
                        data = vrt.read(1, window=window)
                        dst.write(data, 1, window=window)

    print(f"Done. Written to: {dst_path}")
    return dst_path


# Example:
# warp_to_reference_large(
#     src_path="/path/to/your_8gb_raster_wgs84.tif",
#     reference_path="/Users/alonso.gonzalez.glez/Desktop/Instrumentalization/Outputs/Rasterization/KVES_KOD_NATIONAL.tif",
#     dst_path="/path/to/output_warped_to_5514.tif",
#     resampling=Resampling.bilinear,  # continuous data — use .nearest if categorical
# )
