from collections import deque
from shutil import copyfile
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parents[1] / "assets" / "img" / "hexa.png"
FAVICON_DIR = ROOT / "public" / "favicon"
PUBLIC_DIR = ROOT / "public"
PADDING_RATIO = 0.08


def is_background_pixel(pixel: tuple[int, int, int, int]) -> bool:
    r, g, b, a = pixel
    if a == 0:
        return True

    max_channel = max(r, g, b)
    min_channel = min(r, g, b)
    saturation = 0 if max_channel == 0 else (max_channel - min_channel) / max_channel
    return max_channel >= 190 and saturation <= 0.24


def remove_background(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    background = [[False] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if x < 0 or x >= width or y < 0 or y >= height or background[y][x]:
            continue
        if not is_background_pixel(pixels[x, y]):
            continue

        background[y][x] = True
        queue.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))

    output = rgba.copy()
    output_pixels = output.load()
    for y in range(height):
        for x in range(width):
            if background[y][x]:
                r, g, b, _ = output_pixels[x, y]
                output_pixels[x, y] = (r, g, b, 0)

    return output


def trim_and_center(image: Image.Image, size: int) -> Image.Image:
    bbox = image.getbbox()
    if bbox is None:
        raise RuntimeError("Logo could not be isolated from source image.")

    trimmed = image.crop(bbox)
    content_size = max(trimmed.width, trimmed.height)
    canvas_size = max(1, round(content_size / (1 - (PADDING_RATIO * 2))))
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    offset_x = (canvas_size - trimmed.width) // 2
    offset_y = (canvas_size - trimmed.height) // 2
    canvas.paste(trimmed, (offset_x, offset_y), trimmed)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def generate() -> None:
    isolated = remove_background(Image.open(SOURCE))

    png_targets = {
        "android-chrome-192x192.png": 192,
        "android-chrome-512x512.png": 512,
        "apple-touch-icon.png": 180,
        "favicon-16x16.png": 16,
        "favicon-32x32.png": 32,
        "favicon-48x48.png": 48,
        "mstile-150x150.png": 150,
    }

    rendered: dict[int, Image.Image] = {}
    for filename, size in png_targets.items():
        icon = trim_and_center(isolated, size)
        icon.save(FAVICON_DIR / filename)
        rendered[size] = icon

    rendered[512].save(
        FAVICON_DIR / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

    # Safari on iOS often expects touch icons at the web root.
    copyfile(FAVICON_DIR / "apple-touch-icon.png", PUBLIC_DIR / "apple-touch-icon.png")
    copyfile(FAVICON_DIR / "favicon.ico", PUBLIC_DIR / "favicon.ico")


if __name__ == "__main__":
    generate()
