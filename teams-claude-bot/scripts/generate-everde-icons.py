"""Generate Teams color (192) + outline (32) icons from Everde logo."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LOGO_PATH = ROOT / "assets" / "everde-logo.png"
TARGETS = [
    ROOT / "teams-app-manifest",
    ROOT / "teams-app-manifest-hd",
    ROOT / "teams-app-manifest-lowes",
]


def trim_transparent(im: Image.Image, pad: int = 4) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    im = im.crop(bbox)
    out = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    out.paste(im, (pad, pad), im)
    return out


def make_color(logo: Image.Image, size: int = 192) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    margin = int(size * 0.10)
    scaled = logo.copy()
    scaled.thumbnail((size - margin * 2, size - margin * 2), Image.Resampling.LANCZOS)
    x = (size - scaled.width) // 2
    y = (size - scaled.height) // 2
    canvas.paste(scaled, (x, y), scaled)
    return canvas


def make_outline(logo: Image.Image, size: int = 32) -> Image.Image:
    work = logo.copy()
    work.thumbnail((size - 2, size - 2), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - work.width) // 2
    oy = (size - work.height) // 2
    px = work.load()
    for y in range(work.height):
        for x in range(work.width):
            r, g, b, a = px[x, y]
            if a < 40:
                continue
            if r > 245 and g > 245 and b > 245:
                continue
            out.putpixel((ox + x, oy + y), (255, 255, 255, a))
    return out


def main() -> None:
    if not LOGO_PATH.is_file():
        raise SystemExit(f"Missing logo: {LOGO_PATH}")

    logo = trim_transparent(Image.open(LOGO_PATH).convert("RGBA"))
    color = make_color(logo, 192)
    outline = make_outline(logo, 32)

    for target in TARGETS:
        target.mkdir(parents=True, exist_ok=True)
        color.save(target / "color.png")
        outline.save(target / "outline.png")
        print(f"Wrote {target}")

    print(f"color={color.size} outline={outline.size}")


if __name__ == "__main__":
    main()
