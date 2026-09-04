#!/usr/bin/env python3

from pathlib import Path

from PIL import Image, ImageFilter


REPO_ROOT = Path(__file__).resolve().parents[2]
BRAND_ROOT = REPO_ROOT / "assets" / "brand"
BUILD_ROOT = REPO_ROOT / "build"
LEAF_SOURCE = BRAND_ROOT / "foliole-leaf-tight.png"
SIZE = 1024
BRAND_GREEN = (141, 165, 109, 255)
DEV_SKY_BLUE = (94, 176, 224, 255)
MACOS_ARTWORK_SCALE = 0.825


def mix(left: tuple[int, ...], right: tuple[int, ...], amount: float) -> tuple[int, ...]:
    return tuple(round(a + (b - a) * amount) for a, b in zip(left, right))


def vertical_gradient(size: int, stops: list[tuple[float, tuple[int, ...]]]) -> Image.Image:
    image = Image.new("RGBA", (size, size))
    pixels = image.load()
    for y in range(size):
        position = y / max(1, size - 1)
        start, end = stops[0], stops[-1]
        for index in range(len(stops) - 1):
            if stops[index][0] <= position <= stops[index + 1][0]:
                start, end = stops[index], stops[index + 1]
                break
        span = max(0.0001, end[0] - start[0])
        color = mix(start[1], end[1], (position - start[0]) / span)
        for x in range(size):
            pixels[x, y] = color
    return image


def rounded_square_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    from PIL import ImageDraw

    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * 0.225), fill=255)
    return mask


def circle_mask(size: int, inset_ratio: float) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    from PIL import ImageDraw

    inset = round(size * inset_ratio)
    ImageDraw.Draw(mask).ellipse((inset, inset, size - inset - 1, size - inset - 1), fill=255)
    return mask


def alpha_crop(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError(f"leaf source has no visible pixels: {LEAF_SOURCE}")
    return image.crop(bounds)


def fit(image: Image.Image, max_width: int, max_height: int) -> Image.Image:
    scale = min(max_width / image.width, max_height / image.height)
    return image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)


def leaf_mask(leaf: Image.Image, size: int) -> Image.Image:
    fitted = fit(alpha_crop(leaf), round(size * 0.46), round(size * 0.46))
    x = round((size - fitted.width) / 2 + size * 0.013)
    y = round((size - fitted.height) / 2 + size * 0.022)
    mask = Image.new("L", (size, size), 0)
    mask.paste(fitted.getchannel("A"), (x, y))
    return mask


def masked_layer(fill: Image.Image, mask: Image.Image) -> Image.Image:
    layer = fill.copy()
    layer.putalpha(mask)
    return layer


def render_windows(leaf: Image.Image) -> Image.Image:
    canvas = masked_layer(Image.new("RGBA", (SIZE, SIZE), BRAND_GREEN), rounded_square_mask(SIZE))
    disc = masked_layer(Image.new("RGBA", (SIZE, SIZE), "white"), circle_mask(SIZE, 0.14))
    canvas.alpha_composite(disc)
    canvas.alpha_composite(masked_layer(Image.new("RGBA", (SIZE, SIZE), BRAND_GREEN), leaf_mask(leaf, SIZE)))
    return canvas


def render_macos(leaf: Image.Image) -> Image.Image:
    shell = vertical_gradient(SIZE, [(0, (162, 182, 136, 255)), (0.47, (146, 169, 115, 255)), (1, (122, 146, 90, 255))])
    canvas = masked_layer(shell, rounded_square_mask(SIZE))
    disc_fill = vertical_gradient(SIZE, [(0, (255, 255, 255, 255)), (0.29, (255, 255, 255, 255)), (0.63, (242, 246, 237, 255)), (1, (216, 226, 205, 255))])
    canvas.alpha_composite(masked_layer(disc_fill, circle_mask(SIZE, 0.14)))
    mask = leaf_mask(leaf, SIZE)
    shadow = Image.new("L", (SIZE, SIZE), 0)
    shadow.paste(mask, (7, 10))
    shadow = shadow.filter(ImageFilter.GaussianBlur(7)).point(lambda value: round(value * 0.25))
    canvas.alpha_composite(masked_layer(Image.new("RGBA", (SIZE, SIZE), (45, 58, 35, 255)), shadow))
    leaf_fill = vertical_gradient(SIZE, [(0, (157, 178, 125, 255)), (0.48, BRAND_GREEN), (1, (125, 149, 91, 255))])
    canvas.alpha_composite(masked_layer(leaf_fill, mask))
    artwork_size = round(SIZE * MACOS_ARTWORK_SCALE)
    artwork = canvas.resize((artwork_size, artwork_size), Image.Resampling.LANCZOS)
    output = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    centered = round((SIZE - artwork_size) / 2)
    output.alpha_composite(artwork, (centered, centered))
    return output


def render_macos_dev(leaf: Image.Image) -> Image.Image:
    shell = vertical_gradient(SIZE, [(0, (133, 199, 237, 255)), (0.47, DEV_SKY_BLUE), (1, (54, 130, 181, 255))])
    canvas = masked_layer(shell, rounded_square_mask(SIZE))
    disc_fill = vertical_gradient(SIZE, [(0, (255, 255, 255, 255)), (0.29, (255, 255, 255, 255)), (0.63, (244, 245, 241, 255)), (1, (221, 224, 215, 255))])
    canvas.alpha_composite(masked_layer(disc_fill, circle_mask(SIZE, 0.14)))
    mask = leaf_mask(leaf, SIZE)
    shadow = Image.new("L", (SIZE, SIZE), 0)
    shadow.paste(mask, (7, 10))
    shadow = shadow.filter(ImageFilter.GaussianBlur(7)).point(lambda value: round(value * 0.25))
    canvas.alpha_composite(masked_layer(Image.new("RGBA", (SIZE, SIZE), (35, 39, 40, 255)), shadow))
    leaf_fill = vertical_gradient(SIZE, [(0, (116, 188, 231, 255)), (0.48, (74, 159, 213, 255)), (1, (40, 113, 166, 255))])
    canvas.alpha_composite(masked_layer(leaf_fill, mask))
    artwork_size = round(SIZE * MACOS_ARTWORK_SCALE)
    artwork = canvas.resize((artwork_size, artwork_size), Image.Resampling.LANCZOS)
    output = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    centered = round((SIZE - artwork_size) / 2)
    output.alpha_composite(artwork, (centered, centered))
    return output


def save_png(image: Image.Image, path: Path, size: int = SIZE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    output = image if image.size == (size, size) else image.resize((size, size), Image.Resampling.LANCZOS)
    output.save(path, optimize=True)


def save_ico(image: Image.Image, path: Path, sizes: list[int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="ICO", sizes=[(size, size) for size in sizes])


def save_icns(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="ICNS")


def main() -> None:
    leaf = Image.open(LEAF_SOURCE).convert("RGBA")
    windows = render_windows(leaf)
    macos = render_macos(leaf)
    macos_dev = render_macos_dev(leaf)
    save_png(windows, BRAND_ROOT / "foliole-app-icon.png")
    save_png(windows, BRAND_ROOT / "foliole-app-icon-windows.png")
    save_png(macos, BRAND_ROOT / "foliole-app-icon-macos.png")
    save_png(macos_dev, BRAND_ROOT / "foliole-dev-app-icon-macos.png")
    save_png(windows, BUILD_ROOT / "icon.png")
    save_png(macos, BUILD_ROOT / "icon-macos.png")
    save_png(macos_dev, BUILD_ROOT / "icon-dev-macos.png")
    save_ico(windows, BUILD_ROOT / "icon.ico", [16, 24, 32, 48, 64, 128, 256])
    save_icns(macos, BUILD_ROOT / "icon.icns")
    for public_root in (REPO_ROOT / "public", REPO_ROOT / "src" / "companion" / "public"):
        save_png(windows, public_root / "favicon.png", 512)
        save_ico(windows, public_root / "favicon.ico", [16, 32, 48])


if __name__ == "__main__":
    main()
