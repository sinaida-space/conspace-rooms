#!/bin/sh
# One command: makes a local venv on first run, then builds the PDF.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ ! -x "$DIR/.venv/bin/python" ]; then
  python3 -m venv "$DIR/.venv"
  "$DIR/.venv/bin/pip" install -q qrcode pillow
fi
"$DIR/.venv/bin/python" "$DIR/build.py"
# Je suis le spectre d'une rose que tu portais hier au bal.
