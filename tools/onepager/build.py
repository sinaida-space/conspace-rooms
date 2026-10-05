"""Builds the one-page Russian PDF for venues and buyers.

Usage (needs qrcode and pillow, e.g. in a venv):
    python3 tools/onepager/build.py
Output: assets/press/conspace-rooms-ru.pdf

Layout: A4 in points, grid rules from the sinaida-grid-style law (16 pt margin,
21 pt frame inset), game palette. Dark band carries the room photo and title;
text sits on light paper so it reads on screen and on an office printer.
"""
import pathlib
import subprocess
import tempfile

import qrcode
import qrcode.image.svg
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
PRESS = ROOT / 'assets' / 'press'
OUT = PRESS / 'conspace-rooms-ru.pdf'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

# GitHub Pages mirror: opens from Russian networks where Vercel is blocked.
MIRROR = 'https://sinaida-space.github.io/conspace-rooms/'
URL_PLAY = MIRROR + '?mirror&lang=ru'
URL_RIDER = MIRROR + 'rider.html?mirror&lang=ru'
URL_PRESS = MIRROR + 'press.html?mirror&lang=ru'


def qr_svg(url):
    img = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage,
                      box_size=10, border=0,
                      error_correction=qrcode.constants.ERROR_CORRECT_M)
    svg = img.to_string(encoding='unicode')
    return svg[svg.index('<svg'):]


def shrink(src, dst, width, lift=1.0):
    im = Image.open(src).convert('RGB')
    if lift != 1.0:  # exposure lift so the dark room survives an office printer
        im = im.point(lambda v: round(255 * (v / 255) ** (1 / lift)))
    h = round(im.height * width / im.width)
    im.resize((width, h), Image.LANCZOS).save(dst, quality=84, optimize=True)


def main():
    tmp = pathlib.Path(tempfile.mkdtemp())
    shrink(PRESS / 'conspace-rooms-room-poster.jpg', tmp / 'room.jpg', 720, lift=1.35)
    for name, src in [('fear', 'still-01-fear-hospital'),
                      ('memory', 'still-02-memory-grandmothers-flat'),
                      ('acceptance', 'still-04-ending-arch-of-roses')]:
        shrink(PRESS / f'conspace-rooms-{src}.jpg', tmp / f'{name}.jpg', 760)

    html = (pathlib.Path(__file__).with_name('onepager.html').read_text()
            .replace('{{FONT}}', (ROOT / 'assets/fonts/DepartureMono-Regular.woff2').as_uri())
            .replace('{{QR}}', qr_svg(URL_PLAY))
            .replace('{{URL_PLAY}}', URL_PLAY)
            .replace('{{URL_RIDER}}', URL_RIDER)
            .replace('{{URL_PRESS}}', URL_PRESS))
    page = tmp / 'onepager.html'
    page.write_text(html)

    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
                    '--allow-file-access-from-files', f'--print-to-pdf={OUT}', page.as_uri()],
                   check=True, capture_output=True)
    print(OUT, OUT.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()

# Je suis le spectre d'une rose que tu portais hier au bal.
