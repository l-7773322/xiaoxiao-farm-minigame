from __future__ import annotations

import math
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "assets" / "fruit-models"
SOURCE_DIR = ASSET_ROOT / "source"
FINAL_DIR = ASSET_ROOT / "turnarounds"

SHEETS = (
    "classic-source.png",
    "tropical-source.png",
    "melon-source.png",
    "special-source.png",
)

KEY_DISTANCE = 75.0
FULL_DISTANCE = 105.0


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def refine(source_path: Path, output_path: Path) -> None:
    source = Image.open(source_path).convert("RGB")
    key = source.getpixel((0, 0))
    output = Image.new("RGBA", source.size, (0, 0, 0, 0))
    pixels = output.load()

    for y in range(source.height):
        for x in range(source.width):
            red, green, blue = source.getpixel((x, y))
            distance = math.sqrt(
                (red - key[0]) ** 2 + (green - key[1]) ** 2 + (blue - key[2]) ** 2
            )
            if distance <= KEY_DISTANCE:
                pixels[x, y] = (0, 0, 0, 0)
                continue

            if distance >= FULL_DISTANCE:
                pixels[x, y] = (red, green, blue, 255)
                continue

            alpha = smoothstep((distance - KEY_DISTANCE) / (FULL_DISTANCE - KEY_DISTANCE))
            alpha_byte = round(alpha * 255)
            # Recover the subject color from the anti-aliased mix with the key color.
            safe_alpha = max(alpha, 0.28)
            recovered = tuple(
                max(0, min(255, round((channel - key_channel * (1.0 - safe_alpha)) / safe_alpha)))
                for channel, key_channel in zip((red, green, blue), key)
            )
            pixels[x, y] = (*recovered, alpha_byte)

    output.save(output_path, optimize=True)


def main() -> None:
    FINAL_DIR.mkdir(parents=True, exist_ok=True)
    for source_name in SHEETS:
        output_name = source_name.replace("-source.png", "-clean.png")
        refine(SOURCE_DIR / source_name, FINAL_DIR / output_name)
        print(f"Wrote {output_name}")


if __name__ == "__main__":
    main()
