"""Generate the KidVid PNG app icons to match assets/icon.svg.
Run: python3 make_icons.py   (requires Pillow)
"""
from PIL import Image, ImageDraw
import math, os

SS = 4  # supersample factor for smooth edges


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def make(size, maskable=False):
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Diagonal gradient background (#5b2be0 -> #ff4d8d).
    c1, c2 = (0x5b, 0x2b, 0xe0), (0xff, 0x4d, 0x8d)
    grad = Image.new("RGB", (S, S))
    gpx = grad.load()
    for y in range(S):
        for x in range(S):
            t = (x + y) / (2 * (S - 1))
            gpx[x, y] = lerp(c1, c2, t)

    # Corner radius: rounded for normal icons; near-square for maskable
    # (Android crops it into its own shape, so we fill the whole safe area).
    radius = 0 if maskable else int(S * 0.22)
    mask = rounded_mask(S, radius)
    img.paste(grad, (0, 0), mask)

    cx = cy = S / 2

    def p(px, py):
        return (px / 512 * S, py / 512 * S)

    # Draw the foreground on a transparent overlay, then alpha-composite so
    # the translucent circle blends over the gradient instead of replacing it.
    overlay = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)

    # Soft circle behind the play button.
    r = S * 0.293
    od.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 40))
    # Play triangle (matches the SVG path proportions).
    od.polygon([p(212, 176), p(212, 336), p(344, 256)], fill=(255, 255, 255, 255))
    # Little accent dots.
    def dot(px, py, rr, col):
        cc = p(px, py)
        rrr = rr / 512 * S
        od.ellipse([cc[0] - rrr, cc[1] - rrr, cc[0] + rrr, cc[1] + rrr], fill=col)
    dot(150, 150, 20, (255, 210, 63, 255))
    dot(372, 372, 14, (255, 210, 63, 255))

    img = Image.alpha_composite(img, overlay)
    return img.resize((size, size), Image.LANCZOS)


here = os.path.dirname(os.path.abspath(__file__))
make(192, maskable=True).save(os.path.join(here, "icon-192.png"))
make(512, maskable=True).save(os.path.join(here, "icon-512.png"))
make(180, maskable=False).save(os.path.join(here, "icon-180.png"))
print("wrote icon-192.png, icon-512.png, icon-180.png")
