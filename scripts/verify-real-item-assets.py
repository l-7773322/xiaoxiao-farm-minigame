from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RUNTIME_DIR = ROOT / "assets" / "item-models" / "sprites" / "runtime"
ITEMS = (
    "carrot", "bread", "berry", "corn", "mushroom", "pumpkin", "eggplant", "milk", "egg", "pepper", "potato",
    "cup", "mug", "bottle", "tumbler", "glass", "thermos", "teacup", "canteen",
    "cake", "donut", "candy", "cookie", "icecream", "pudding", "macaron", "cupcake",
    "tomato", "cucumber", "onion",
    "broccoli", "radish", "garlic",
    "cherry", "lime", "zucchini",
    "wine-glass", "mason-jar", "enamel-mug",
    "cheese", "rolling-pin", "whisk",
    "croissant", "fruit-tart", "chocolate",
)
VIEWS = ("front", "three-quarter", "side", "top")


def largest_component(alpha: Image.Image, threshold: int = 12) -> tuple[int, tuple[int, int, int, int]]:
    width, height = alpha.size
    pixels = alpha.load()
    seen: set[tuple[int, int]] = set()
    best_count, best_bbox = 0, (0, 0, 0, 0)
    for y in range(height):
        for x in range(width):
            if pixels[x, y] <= threshold or (x, y) in seen:
                continue
            queue = deque([(x, y)])
            seen.add((x, y))
            count = 0
            left = right = x
            top = bottom = y
            while queue:
                px, py = queue.popleft()
                count += 1
                left, right = min(left, px), max(right, px)
                top, bottom = min(top, py), max(bottom, py)
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if 0 <= nx < width and 0 <= ny < height and pixels[nx, ny] > threshold and (nx, ny) not in seen:
                        seen.add((nx, ny))
                        queue.append((nx, ny))
            if count > best_count:
                best_count, best_bbox = count, (left, top, right + 1, bottom + 1)
    return best_count, best_bbox


def main() -> None:
    expected = {f"{item}-{view}.webp" for item in ITEMS for view in VIEWS}
    actual = {path.name for path in RUNTIME_DIR.glob("*.webp")}
    if actual != expected:
        raise AssertionError(f"Runtime atlas mismatch: missing={sorted(expected - actual)}, extra={sorted(actual - expected)}")
    for filename in sorted(expected):
        image = Image.open(RUNTIME_DIR / filename).convert("RGBA")
        if image.size != (256, 256):
            raise AssertionError(f"{filename}: unexpected size {image.size}")
        alpha = image.getchannel("A")
        if any(alpha.getpixel(point) > 4 for point in ((0, 0), (255, 0), (0, 255), (255, 255))):
            raise AssertionError(f"{filename}: corner is not transparent")
        visible = sum(1 for value in alpha.get_flattened_data() if value > 12)
        component, bbox = largest_component(alpha)
        if visible < 3500:
            raise AssertionError(f"{filename}: subject coverage is too small ({visible})")
        # Fine detached details such as raspberry drupelets, a cup handle, or
        # a thermos strap are intentional; still reject obviously shattered
        # sprites while allowing these physically plausible silhouettes.
        if component / visible < 0.80:
            raise AssertionError(f"{filename}: subject is fragmented ({component}/{visible})")
        left, top, right, bottom = bbox
        if min(left, top, 256 - right, 256 - bottom) < 8:
            raise AssertionError(f"{filename}: subject is too close to an edge ({bbox})")
    print("Verified 45 photorealistic item models, 180 transparent runtime views")


if __name__ == "__main__":
    main()
