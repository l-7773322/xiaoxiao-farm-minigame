from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "assets" / "fruit-models"
TURNAROUND_DIR = ASSET_ROOT / "turnarounds"
MASTER_DIR = ASSET_ROOT / "sprites" / "master"
RUNTIME_DIR = ASSET_ROOT / "sprites" / "runtime"

SHEETS = {
    "classic-photoreal-v2-clean.png": ("apple", "pear", "orange"),
    "tropical-photoreal-v2-clean.png": ("banana", "pineapple", "mango"),
    "melon-photoreal-v2-clean.png": ("watermelon", "cantaloupe", "pomegranate"),
    "special-photoreal-v2-clean.png": ("dragon-fruit", "coconut", "avocado"),
    "orchard-photoreal-v2-clean.png": ("strawberry", "lemon", "peach"),
    "exotic-photoreal-v2-clean.png": ("kiwi", "grapes", "papaya"),
}

VIEWS = ("front", "three-quarter", "side", "top")


def refine_external_alpha(image: Image.Image) -> Image.Image:
    """Feather only the outside silhouette to remove colored matte fringes."""
    alpha = image.getchannel("A")
    silhouette = alpha.point(lambda value: 255 if value > 12 else 0)
    interior = silhouette.filter(ImageFilter.MinFilter(3))
    feathered = interior.filter(ImageFilter.GaussianBlur(0.65))
    cleaned = ImageChops.multiply(alpha, feathered)
    output = image.copy()
    output.putalpha(cleaned)
    return output


def normalize_cell(cell: Image.Image, canvas_size: int, object_size: int) -> Image.Image:
    alpha = cell.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
    if bbox is None:
        raise ValueError("Turnaround cell contains no visible subject")

    subject = cell.crop(bbox)
    scale = min(object_size / subject.width, object_size / subject.height)
    output_size = (
        max(1, round(subject.width * scale)),
        max(1, round(subject.height * scale)),
    )
    subject = subject.resize(output_size, Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    # Every view is normalized to the same longest-edge footprint, so rotating
    # a fruit never makes it visibly pulse larger or smaller in the pile.
    offset = ((canvas_size - subject.width) // 2, (canvas_size - subject.height) // 2)
    canvas.alpha_composite(subject, offset)
    return refine_external_alpha(canvas)


def main() -> None:
    MASTER_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

    written = 0
    for sheet_name, fruits in SHEETS.items():
        image = Image.open(TURNAROUND_DIR / sheet_name).convert("RGBA")
        if image.width % 4 or image.height % 3:
            raise ValueError(f"Unexpected sheet dimensions for {sheet_name}: {image.size}")

        cell_width = image.width // 4
        cell_height = image.height // 3
        for row, fruit in enumerate(fruits):
            for column, view in enumerate(VIEWS):
                cell = image.crop(
                    (
                        column * cell_width,
                        row * cell_height,
                        (column + 1) * cell_width,
                        (row + 1) * cell_height,
                    )
                )
                master = normalize_cell(cell, canvas_size=512, object_size=452)
                runtime = master.resize((256, 256), Image.Resampling.LANCZOS)

                filename = f"{fruit}-{view}"
                master.save(MASTER_DIR / f"{filename}.png", optimize=True)
                runtime.convert("RGBA").save(
                    RUNTIME_DIR / f"{filename}.webp",
                    format="WEBP",
                    quality=88,
                    method=6,
                )
                written += 1

    print(f"Wrote {written} master PNG files and {written} runtime WebP files")


if __name__ == "__main__":
    main()
