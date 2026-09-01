"""Generates the 1200x630 Open Graph / Twitter card preview image for the
landing page, matching the dark hero's terracotta-on-charcoal identity.
Run with: python scripts/generate_social_preview.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

WIDTH, HEIGHT = 1200, 630
OUT_PATH = Path(__file__).resolve().parent.parent / "public" / "social-preview.png"

BASE_BG = (12, 10, 9)
GLOW = (212, 114, 82)
BADGE_BG = (119, 55, 34)
RING = (250, 250, 249)
TERRACOTTA_500 = (200, 87, 50)
STONE_100 = (245, 245, 244)
STONE_400 = (168, 162, 158)

FONTS_DIR = Path(r"C:\Windows\Fonts")


def load_font(name, size):
    return ImageFont.truetype(str(FONTS_DIR / name), size)


def add_glow(base, center, radius, color, alpha):
    glow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    x, y = center
    draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=(*color, alpha))
    glow = glow.filter(ImageFilter.GaussianBlur(radius * 0.55))
    base.alpha_composite(glow)


def draw_compass_mark(base, top_left, size):
    x, y = top_left
    badge = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(badge)
    radius = int(size * 0.25)
    d.rounded_rectangle([0, 0, size, size], radius=radius, fill=(*BADGE_BG, 255))

    cx = cy = size / 2
    ring_r = size * 0.28
    ring_w = max(2, round(size * 0.06))
    d.ellipse(
        [cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r],
        outline=(*RING, 255),
        width=ring_w,
    )

    k = size * 0.135
    d.polygon(
        [
            (cx + k, cy - k),
            (cx + k * 0.28, cy + k * 0.28),
            (cx - k, cy + k),
            (cx - k * 0.28, cy - k * 0.28),
        ],
        fill=(*RING, 255),
    )
    dot_r = size * 0.04
    d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=(*BADGE_BG, 255))

    base.alpha_composite(badge, top_left)


def main():
    base = Image.new("RGBA", (WIDTH, HEIGHT), (*BASE_BG, 255))

    # Vertical warm-to-dark wash, matching the site's dark-mode hero gradient.
    wash = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    wash_draw = ImageDraw.Draw(wash)
    top = (37, 20, 14)
    for row in range(HEIGHT):
        t = row / HEIGHT
        r = round(BASE_BG[0] + (top[0] - BASE_BG[0]) * (1 - t) * 0.6)
        g = round(BASE_BG[1] + (top[1] - BASE_BG[1]) * (1 - t) * 0.6)
        b = round(BASE_BG[2] + (top[2] - BASE_BG[2]) * (1 - t) * 0.6)
        wash_draw.line([(0, row), (WIDTH, row)], fill=(r, g, b, 255))
    base.alpha_composite(wash)

    add_glow(base, (WIDTH - 120, 60), 420, GLOW, 46)
    add_glow(base, (80, HEIGHT - 40), 380, GLOW, 32)

    draw_compass_mark(base, (96, 92), 76)

    wordmark_font = load_font("segoeuib.ttf", 40)
    headline_font = load_font("seguibl.ttf", 76)
    body_font = load_font("segoeui.ttf", 32)
    eyebrow_font = load_font("segoeuib.ttf", 22)

    draw = ImageDraw.Draw(base)
    draw.text((190, 108), "Pathwise", font=wordmark_font, fill=(*STONE_100, 255))

    draw.text((96, 232), "COURSES THAT CONNECT", font=eyebrow_font, fill=(*TERRACOTTA_500, 255))

    draw.text((96, 282), "Find the course", font=headline_font, fill=(*STONE_100, 255))
    y2 = 282 + 88
    draw.text((96, y2), "that ", font=headline_font, fill=(*STONE_100, 255))
    fits_x = 96 + draw.textlength("that ", font=headline_font)
    draw.text((fits_x, y2), "fits.", font=headline_font, fill=(*TERRACOTTA_500, 255))

    body_lines = [
        "Personalised course recommendations built from your",
        "degree programme, skills, and learning goals.",
    ]
    by = y2 + 108
    for line in body_lines:
        draw.text((96, by), line, font=body_font, fill=(*STONE_400, 255))
        by += 44

    out = base.convert("RGB")
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT_PATH, "PNG", optimize=True)
    print(f"Wrote {OUT_PATH} ({OUT_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
