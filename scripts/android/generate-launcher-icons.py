#!/usr/bin/env python3

from pathlib import Path
from PIL import Image, ImageDraw

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_LEAF = REPO_ROOT / "assets" / "brand" / "foliole-leaf-tight.png"
RES_ROOT = REPO_ROOT / "android" / "app" / "src" / "main" / "res"
LAUNCHER_BACKGROUND = "#FF8DA56D"
BRAND_GREEN = (141, 165, 109, 255)
SPLASH_BACKGROUND = (24, 29, 27, 255)
# Android exposes the central 72/108 layer; retain the brand artwork's 0.825 outer scale.
ADAPTIVE_DISC_RATIO = 0.396

LAUNCHER_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

FOREGROUND_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def color_resource(color: str) -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        f'    <color name="ic_launcher_background">{color}</color>\n'
        "</resources>\n"
    )


def alpha_crop(image: Image.Image) -> Image.Image:
    bbox = image.getbbox()
    if bbox is None:
        raise ValueError(f"source icon has no visible pixels: {SOURCE_LEAF}")
    return image.crop(bbox)


def fit(image: Image.Image, max_width: int, max_height: int) -> Image.Image:
    width, height = image.size
    scale = min(max_width / width, max_height / height)
    size = (round(width * scale), round(height * scale))
    return image.resize(size, Image.Resampling.LANCZOS)


def centered(canvas: Image.Image, image: Image.Image) -> Image.Image:
    x = (canvas.width - image.width) // 2
    y = (canvas.height - image.height) // 2
    canvas.alpha_composite(image, (x, y))
    return canvas


def tinted_leaf(leaf: Image.Image) -> Image.Image:
    tinted = Image.new("RGBA", leaf.size, BRAND_GREEN)
    tinted.putalpha(leaf.getchannel("A"))
    return tinted


def add_brand_mark(canvas: Image.Image, leaf: Image.Image, disc_ratio: float) -> None:
    disc_size = round(canvas.width * disc_ratio)
    disc = Image.new("RGBA", (disc_size, disc_size), (255, 255, 255, 255))
    disc_mask = Image.new("L", disc.size, 0)
    ImageDraw.Draw(disc_mask).ellipse((0, 0, disc_size - 1, disc_size - 1), fill=255)
    disc.putalpha(disc_mask)
    centered(canvas, disc)
    logo = fit(tinted_leaf(leaf), round(canvas.width * disc_ratio * 0.64), round(canvas.height * disc_ratio * 0.64))
    x = round((canvas.width - logo.width) / 2 + canvas.width * 0.013)
    y = round((canvas.height - logo.height) / 2 + canvas.height * 0.022)
    canvas.alpha_composite(logo, (x, y))


def generate_legacy_icons(leaf: Image.Image) -> None:
    for folder, size in LAUNCHER_SIZES.items():
        square = Image.new("RGBA", (size, size), BRAND_GREEN)
        add_brand_mark(square, leaf, 0.72)
        square.save(RES_ROOT / folder / "ic_launcher.png")

        circle = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        bg = Image.new("RGBA", (size, size), BRAND_GREEN)
        bg.putalpha(mask)
        circle.alpha_composite(bg)
        add_brand_mark(circle, leaf, 0.72)
        circle.save(RES_ROOT / folder / "ic_launcher_round.png")


def generate_adaptive_foregrounds(leaf: Image.Image) -> None:
    for folder, size in FOREGROUND_SIZES.items():
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        add_brand_mark(canvas, leaf, ADAPTIVE_DISC_RATIO)
        canvas.save(RES_ROOT / folder / "ic_launcher_foreground.png")


def generate_splashes(leaf: Image.Image) -> None:
    for path in sorted(RES_ROOT.glob("drawable*/splash.png")):
        old = Image.open(path).convert("RGBA")
        canvas = Image.new("RGBA", old.size, SPLASH_BACKGROUND)
        logo = fit(leaf, round(min(old.size) * 0.26), round(min(old.size) * 0.26))
        centered(canvas, logo)
        canvas.save(path)


def main() -> None:
    leaf = alpha_crop(Image.open(SOURCE_LEAF).convert("RGBA"))
    generate_legacy_icons(leaf)
    generate_adaptive_foregrounds(leaf)
    generate_splashes(leaf)
    write_text(RES_ROOT / "values" / "ic_launcher_background.xml", color_resource(LAUNCHER_BACKGROUND))
    write_text(
        RES_ROOT / "values-night" / "ic_launcher_background.xml",
        color_resource(LAUNCHER_BACKGROUND),
    )


if __name__ == "__main__":
    main()
