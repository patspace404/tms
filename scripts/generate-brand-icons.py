"""Render app/icon.svg's geometry to the raster sizes browsers still ask for.

Run from the repo root whenever the mark changes:

    python3 scripts/generate-brand-icons.py

Writes app/favicon.ico and app/apple-icon.png. Needs Pillow.
"""
from PIL import Image, ImageDraw

NAVY, BLUE = (32, 53, 110), (45, 101, 178)
VX, VY, VS = 60, 48, 290          # the viewBox app/icon.svg uses
SS = 16                           # supersample factor

S = VS * SS
def u(v):                         # viewBox units -> supersampled pixels
    return v * SS

def mask(draw_fn):
    m = Image.new("L", (S, S), 0)
    draw_fn(ImageDraw.Draw(m))
    return m

def rect(d, x0, y0, x1, y1, fill=255, r=0, corners=None):
    box = (u(x0 - VX), u(y0 - VY), u(x1 - VX) - 1, u(y1 - VY) - 1)
    if r:
        d.rounded_rectangle(box, radius=u(r), fill=fill, corners=corners)
    else:
        d.rectangle(box, fill=fill)

def glyph(d):
    rect(d, 87, 119, 228, 240, r=36, corners=(True, False, False, True))
    rect(d, 228, 157, 266, 240)
    rect(d, 227, 240, 266, 286)
    rect(d, 92, 286, 266, 323, r=36, corners=(False, False, True, False))
    rect(d, 126, 157, 228, 202, fill=0, r=4)   # the counter, knocked out

def brackets(d):
    rect(d, 228, 62, 247, 81)
    rect(d, 266, 62, 323, 81)
    rect(d, 304, 62, 323, 156)
    rect(d, 228, 100, 285, 119)
    rect(d, 266, 100, 285, 156)

def render(tile_alpha):
    tile = mask(lambda d: rect(d, VX, VY, VX + VS, VY + VS, fill=tile_alpha, r=64))
    img = Image.new("RGBA", (S, S), (255, 255, 255, 0))
    img.paste((255, 255, 255, 255), (0, 0), tile)
    img.paste(NAVY, (0, 0), mask(glyph))
    img.paste(BLUE, (0, 0), mask(brackets))
    return img

def render_square():
    img = Image.new("RGBA", (S, S), (255, 255, 255, 255))
    img.paste(NAVY, (0, 0), mask(glyph))
    img.paste(BLUE, (0, 0), mask(brackets))
    return img


def render_small():
    """A tab favicon is 16 or 32 pixels wide.

    The blue brackets are hairlines up there and land as grey speckle, so the
    small entries in the .ico carry the glyph alone, framed to its own bounds.
    """
    global VX, VY, VS
    VX, VY, VS = 57, 101, 240      # the glyph's own box, plus a little air
    S2 = VS * SS
    img = Image.new("RGBA", (S2, S2), (255, 255, 255, 0))
    tile = Image.new("L", (S2, S2), 0)
    ImageDraw.Draw(tile).rounded_rectangle((0, 0, S2 - 1, S2 - 1), radius=u(48), fill=255)
    img.paste((255, 255, 255, 255), (0, 0), tile)
    m = Image.new("L", (S2, S2), 0)
    glyph(ImageDraw.Draw(m))
    img.paste(NAVY, (0, 0), m)
    return img


def down(img, n):
    return img.resize((n, n), Image.LANCZOS)


full, square = render(255), render_square()
small = render_small()
SIZES = [16, 32, 48, 64, 128, 256]
frames = {n: down(small if n <= 32 else full, n) for n in SIZES}
frames[256].save(
    "app/favicon.ico", format="ICO",
    sizes=[(n, n) for n in SIZES],
    append_images=[frames[n] for n in SIZES if n != 256],
)
down(square, 180).convert("RGB").save("app/apple-icon.png")
print("written")
