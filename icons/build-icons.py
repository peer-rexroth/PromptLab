#!/usr/bin/env python3
"""Builds every PromptLab app-icon file from the flat layers in icons/source/.

    python3 icons/build-icons.py          (needs Python 3 + Pillow, and Google Chrome for rendering)

The source of truth is FLAT: icons/source/background.svg plus the numbered layer-*.svg files — no mask, shadow or highlight
painted in — which is also exactly what Apple's Icon Composer takes. This script adds the system-style treatment (squircle
mask, soft shadow, specular highlight, lit edge) to produce the PNG/SVG files a *web* app needs, because no OS applies it to a PNG:

  icon.svg             full-bleed squircle with the glass treatment  (favicon)
  icon-192/512.png     macOS "any" icons: squircle inset to 80% on a transparent canvas, with its own drop shadow
  icon-192/512-maskable.png   full-bleed square; the OS applies its own mask (the flask sits inside the 80% safe circle)
  icon-180.png         apple-touch-icon: full-bleed square (iOS masks it)
"""
import glob, math, os, re, subprocess, tempfile
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'source')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

def inner(path):
    s = open(path).read()
    return re.sub(r'^<svg[^>]*>|</svg>\s*$', '', s.strip())

def squircle(n=5, N=360, c=512, a=512):          # Apple-style continuous corner (superellipse)
    pts = []
    for i in range(N):
        t = 2 * math.pi * i / N; ct, st = math.cos(t), math.sin(t)
        pts.append((c + a * math.copysign(abs(ct) ** (2 / n), ct), c + a * math.copysign(abs(st) ** (2 / n), st)))
    return 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + ' Z'

SQ = squircle()
BG = inner(os.path.join(SRC, 'background.svg'))
LAYERS = ''.join(f'<g>{inner(p)}</g>' for p in sorted(glob.glob(os.path.join(SRC, 'layer-*.svg'))) if not p.endswith('-dark.svg'))

DEFS = f'''<clipPath id="sq"><path d="{SQ}"/></clipPath>
<radialGradient id="spec" cx="0.28" cy="0.04" r="0.85"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.6" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.7"/><stop offset="0.45" stop-color="#fff" stop-opacity="0.04"/><stop offset="1" stop-color="#fff" stop-opacity="0.2"/></linearGradient>
<filter id="fgshadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#000" flood-opacity="0.26"/></filter>
<filter id="outer" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity="0.38"/></filter>'''

def squircle_icon():
    return f'''<g clip-path="url(#sq)">{BG}<g filter="url(#fgshadow)">{LAYERS}</g><rect width="1024" height="1024" fill="url(#spec)"/></g>
<path d="{SQ}" fill="none" stroke="url(#rim)" stroke-width="10" clip-path="url(#sq)"/>'''

def svg(body, defs=DEFS):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>{defs}</defs>{body}</svg>'

VARIANTS = {
    'icon.svg-source': svg(squircle_icon()),
    'any': svg(f'<g filter="url(#outer)"><path d="{SQ}" transform="translate(100 100) scale(0.8047)" fill="#000"/></g><g transform="translate(100 100) scale(0.8047)">{squircle_icon()}</g>'),
    'maskable': svg(f'{BG}<g>{LAYERS}</g><rect width="1024" height="1024" fill="url(#spec)"/>'),
}

def render(svg_text, out_png, size=1024):
    with tempfile.TemporaryDirectory() as d:
        html = os.path.join(d, 'i.html'); png = os.path.join(d, 'i.png')
        sized = svg_text.replace('<svg ', '<svg width="%d" height="%d" ' % (size, size), 1)
        open(html, 'w').write('<!doctype html><body style="margin:0;background:transparent">' + sized + '</body>')
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
                        f'--window-size={size},{size}', f'--screenshot={png}', 'file://' + html], check=True, capture_output=True)
        Image.open(png).convert('RGBA').save(out_png)

def main():
    open(os.path.join(HERE, 'icon.svg'), 'w').write(VARIANTS['icon.svg-source'])
    big = {}
    for key in ('any', 'maskable'):
        p = os.path.join(tempfile.gettempdir(), f'promptlab-{key}-1024.png'); render(VARIANTS[key], p); big[key] = Image.open(p)
    for size in (192, 512):
        big['any'].resize((size, size), Image.LANCZOS).save(os.path.join(HERE, f'icon-{size}.png'))
        big['maskable'].resize((size, size), Image.LANCZOS).save(os.path.join(HERE, f'icon-{size}-maskable.png'))
    big['maskable'].convert('RGB').resize((180, 180), Image.LANCZOS).save(os.path.join(HERE, 'icon-180.png'))
    print('icons written:', ', '.join(sorted(f for f in os.listdir(HERE) if f.startswith('icon'))))

if __name__ == '__main__':
    main()
