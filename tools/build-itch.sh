#!/bin/sh
# Builds dist/conspace-rooms-itch.zip for an itch.io HTML5 upload: the static
# site as it is, minus what only the Vercel deploy or the repo needs.
# Run from the repo root: sh tools/build-itch.sh
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
OUT=dist/conspace-rooms-itch.zip
rm -f "$OUT"
zip -qr "$OUT" \
  index.html gallery.html press.html rider.html tech.html privacy.html voprosy.html favicon.ico \
  css src assets vendor \
  -x '*.DS_Store' 'assets/press/*.mp4'
ls -lh "$OUT"
unzip -l "$OUT" | tail -1
# Je suis le spectre d'une rose que tu portais hier au bal.
