from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "assets" / "item-models"
GENERATED_DIR = ASSET_ROOT / "source"
MASTER_DIR = ASSET_ROOT / "sprites" / "master"
RUNTIME_DIR = ASSET_ROOT / "sprites" / "runtime"

# Source image, then three row labels. All sheets use front / three-quarter /
# side / top from left to right. Later sheets deliberately supersede duplicates.
SHEETS = {
    "exec-cb21b2cc-c13e-4b0e-a81e-ddd1a0a0126b.png": ("carrot", "corn", "pumpkin"),
    "exec-11146237-9fd3-4802-a34d-50d655ec9679.png": ("carrot", "bread", "berry"),
    "exec-73d075c1-43e8-4ae4-85ef-7101d48e0a53.png": ("corn", "mushroom", "pumpkin"),
    "exec-5ba8231a-3832-4794-b5e2-427f45998106.png": ("eggplant", "milk", "egg"),
    "exec-0d606dd4-d1d4-4b47-9070-763278b872d9.png": ("pepper", "potato", "glass"),
    "exec-e43e2fc5-9ca8-4623-9f5b-00b1a5243b8e.png": ("cup", "mug", "bottle"),
    "exec-4e94a08c-6c00-456f-b640-b8d24d12ce34.png": ("tumbler", "glass", "thermos"),
    "exec-9e8c3cf7-23c9-4f91-98ea-611b9abeb458.png": ("teacup", "canteen", "bottle"),
    "exec-832dec32-0751-4591-9925-3825c31ebce9.png": ("cake", "donut", "candy"),
    "exec-93ef00a8-e7c6-4189-852b-cf614bb5a7ac.png": ("cookie", "icecream", "pudding"),
    "exec-657c0538-18dd-40a5-a98c-cea0a2720b89.png": ("macaron", "cupcake", "macaron"),
    "exec-generated-20260813-tomato-cucumber-onion-clean.png": ("tomato", "cucumber", "onion"),
    "exec-generated-20260813-broccoli-radish-garlic-clean-nogrid.png": ("broccoli", "radish", "garlic"),
    # The v4 sheets share one photorealistic studio setup.  They intentionally
    # come last so these regenerated models replace the weakest mixed-batch
    # sprites while the remainder of the complete 45-item atlas is preserved.
    "photoreal-v4-produce.png": ("tomato", "cucumber", "onion"),
    "photoreal-v4-cups.png": ("tumbler", "glass", "thermos"),
    "photoreal-v4-kitchen.png": ("carrot", "bread", "berry"),
    "photoreal-v4-desserts.png": ("cake", "donut", "cupcake"),
    "photoreal-v5-produce-additions.png": ("cherry", "lime", "zucchini"),
    "photoreal-v5-cups-additions.png": ("wine-glass", "mason-jar", "enamel-mug"),
    "photoreal-v5-kitchen-additions.png": ("cheese", "rolling-pin", "whisk"),
    "photoreal-v5-dessert-additions.png": ("croissant", "fruit-tart", "chocolate"),
}

ALIASES: dict[str, str] = {}
VIEWS = ("front", "three-quarter", "side", "top")


def refine_external_alpha(image: Image.Image) -> Image.Image:
    """Remove the one-pixel colored matte without flattening real materials.

    Generated glass and cream can legitimately contain partial alpha inside
    the silhouette, so only the *outside* edge is tightened and feathered.
    This keeps transparent glass believable while removing red/green key-color
    fringes that become obvious against the warm game background.
    """
    alpha = image.getchannel("A")
    silhouette = alpha.point(lambda value: 255 if value > 12 else 0)
    interior = silhouette.filter(ImageFilter.MinFilter(3))
    feathered = interior.filter(ImageFilter.GaussianBlur(0.65))
    cleaned = ImageChops.multiply(alpha, feathered)
    output = image.copy()
    output.putalpha(cleaned)
    return output


def normalize_cell(cell: Image.Image, canvas_size: int = 512, object_size: int = 452) -> Image.Image:
    alpha = cell.getchannel("A")
    width, height = alpha.size
    pixels = alpha.load()
    seen = bytearray(width * height)
    largest: list[int] = []
    for y in range(height):
        for x in range(width):
            start = y * width + x
            if seen[start] or pixels[x, y] <= 8:
                continue
            queue = deque([start])
            seen[start] = 1
            component: list[int] = []
            while queue:
                index = queue.popleft()
                component.append(index)
                px, py = index % width, index // width
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    neighbor = ny * width + nx
                    if 0 <= nx < width and 0 <= ny < height and not seen[neighbor] and pixels[nx, ny] > 8:
                        seen[neighbor] = 1
                        queue.append(neighbor)
            if len(component) > len(largest):
                largest = component
    if not largest:
        raise ValueError("Turnaround cell contains no visible subject")

    # A few source sheets deliberately use a generous grid; soft antialiasing
    # can still let a neighbouring cell peek across the border. Keep only the
    # dominant connected object for this cell so a cup never inherits a sliver
    # of the mug placed directly underneath it.
    isolated = Image.new("RGBA", cell.size, (0, 0, 0, 0))
    source = cell.load()
    target = isolated.load()
    for index in largest:
        x, y = index % width, index // width
        target[x, y] = source[x, y]
    bbox = isolated.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Turnaround cell contains no visible subject")
    subject = isolated.crop(bbox)
    scale = min(object_size / subject.width, object_size / subject.height)
    subject = subject.resize(
        (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    canvas.alpha_composite(subject, ((canvas_size - subject.width) // 2, (canvas_size - subject.height) // 2))
    return refine_external_alpha(canvas)


def write_sprite(item: str, view: str, master: Image.Image) -> None:
    master.save(MASTER_DIR / f"{item}-{view}.png", optimize=True)
    master.resize((256, 256), Image.Resampling.LANCZOS).save(
        RUNTIME_DIR / f"{item}-{view}.webp", format="WEBP", quality=88, method=6
    )


def main() -> None:
    MASTER_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    for directory, extension in ((MASTER_DIR, "*.png"), (RUNTIME_DIR, "*.webp")):
        for path in directory.glob(extension):
            path.unlink()

    sprites: dict[str, dict[str, Image.Image]] = {}
    for source_name, item_rows in SHEETS.items():
        image = Image.open(GENERATED_DIR / source_name).convert("RGBA")
        # Generated sheets can have a one-pixel rounding remainder. Split by
        # proportional boundaries so the final row/column still receives the
        # complete subject instead of rejecting an otherwise valid atlas.
        cell_width, cell_height = image.width / 4, image.height / 3
        for row, item in enumerate(item_rows):
            item_sprites = sprites.setdefault(item, {})
            for column, view in enumerate(VIEWS):
                left = round(column * cell_width)
                top = round(row * cell_height)
                right = round((column + 1) * cell_width)
                bottom = round((row + 1) * cell_height)
                cell = image.crop((left, top, right, bottom))
                item_sprites[view] = normalize_cell(cell)

    for item, views in sprites.items():
        for view, master in views.items():
            write_sprite(item, view, master)
    for item, source_item in ALIASES.items():
        for view, master in sprites[source_item].items():
            write_sprite(item, view, master)

    print(f"Wrote {sum(1 for _ in MASTER_DIR.glob('*.png'))} master sprites and {sum(1 for _ in RUNTIME_DIR.glob('*.webp'))} runtime sprites")


if __name__ == "__main__":
    main()
