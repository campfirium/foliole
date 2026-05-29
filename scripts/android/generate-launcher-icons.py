#!/usr/bin/env python3

from pathlib import Path
from PIL import Image, ImageDraw

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_ICON = REPO_ROOT / "build" / "icon.png"
RES_ROOT = REPO_ROOT / "android" / "app" / "src" / "main" / "res"
LIGHT_BACKGROUND = "#FFFFFFFF"
DARK_BACKGROUND = "#FF111411"
SPLASH_BACKGROUND = (24, 29, 27, 255)

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
        raise ValueError(f"source icon has no visible pixels: {SOURCE_ICON}")
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


def generate_legacy_icons(source: Image.Image, leaf: Image.Image) -> None:
    for folder, size in LAUNCHER_SIZES.items():
        square = Image.new("RGBA", (size, size), (255, 255, 255, 255))
        centered(square, fit(leaf, round(size * 0.72), round(size * 0.72)))
        square.save(RES_ROOT / folder / "ic_launcher.png")

        circle = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        bg = Image.new("RGBA", (size, size), (255, 255, 255, 255))
        bg.putalpha(mask)
        circle.alpha_composite(bg)
        centered(circle, fit(leaf, round(size * 0.62), round(size * 0.62)))
        circle.save(RES_ROOT / folder / "ic_launcher_round.png")


def generate_adaptive_foregrounds(leaf: Image.Image) -> None:
    for folder, size in FOREGROUND_SIZES.items():
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        icon = fit(leaf, round(size * 0.58), round(size * 0.58))
        centered(canvas, icon)
        canvas.save(RES_ROOT / folder / "ic_launcher_foreground.png")


def generate_splashes(leaf: Image.Image) -> None:
    for path in sorted(RES_ROOT.glob("drawable*/splash.png")):
        old = Image.open(path).convert("RGBA")
        canvas = Image.new("RGBA", old.size, SPLASH_BACKGROUND)
        logo = fit(leaf, round(min(old.size) * 0.26), round(min(old.size) * 0.26))
        centered(canvas, logo)
        canvas.save(path)


def main() -> None:
    source = Image.open(SOURCE_ICON).convert("RGBA")
    leaf = alpha_crop(source)
    generate_legacy_icons(source, leaf)
    generate_adaptive_foregrounds(leaf)
    generate_splashes(leaf)
    write_text(RES_ROOT / "values" / "ic_launcher_background.xml", color_resource(LIGHT_BACKGROUND))
    write_text(
        RES_ROOT / "values-night" / "ic_launcher_background.xml",
        color_resource(DARK_BACKGROUND),
    )


if __name__ == "__main__":
    main()
