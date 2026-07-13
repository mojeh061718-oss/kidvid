"""Generate the MaeTube PNG app icons to match assets/icon.svg.
A YouTube-style red play button on the app's dark theme.
Run: python3 make_icons.py   (requires Pillow)
"""
from PIL import Image, ImageDraw
import os

SS = 4  # supersample factor for smooth edges


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def make(size, maskable=False):
    S = size * SS

    # Dark diagonal gradient background (#2b2166 -> #12102a) matching the app.
    c1, c2 = (0x2b, 0x21, 0x66), (0x12, 0x10, 0x2a)
    grad = Image.new("RGB", (S, S))
    gpx = grad.load()
    for y in range(S):
        for x in range(S):
            gpx[x, y] = lerp(c1, c2, (x + y) / (2 * (S - 1)))

    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    # Maskable icons fill the whole tile (Android crops); others get rounded corners.
    radius = 0 if maskable else int(S * 0.22)
    img.paste(grad, (0, 0), rounded_mask(S, radius))

    overlay = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)

    def px(x, y):
        return (x / 512 * S, y / 512 * S)

    # Red rounded rectangle "play button" with a vertical red gradient.
    rx0, ry0, rx1, ry1 = px(96, 150)[0], px(96, 150)[1], px(416, 362)[0], px(416, 362)[1]
    red = Image.new("RGB", (S, S))
    rpx = red.load()
    for y in range(S):
        rpx[0, y] = lerp((0xff, 0x2a, 0x58), (0xff, 0x00, 0x33), y / (S - 1))
        for x in range(1, S):
            rpx[x, y] = rpx[0, y]
    rmask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(rmask).rounded_rectangle([rx0, ry0, rx1, ry1], radius=54 / 512 * S, fill=255)
    overlay.paste(red, (0, 0), rmask)

    # White play triangle.
    od.polygon([px(226, 212), px(226, 300), px(306, 256)], fill=(255, 255, 255, 255))

    img = Image.alpha_composite(img, overlay)
    return img.resize((size, size), Image.LANCZOS)


here = os.path.dirname(os.path.abspath(__file__))
make(192, maskable=True).save(os.path.join(here, "icon-192.png"))
make(512, maskable=True).save(os.path.join(here, "icon-512.png"))
make(180, maskable=False).save(os.path.join(here, "icon-180.png"))
print("wrote icon-192.png, icon-512.png, icon-180.png")
