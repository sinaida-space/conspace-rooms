#!/bin/sh
# Packs the committed tree as the local build sent to a venue, with its
# SHA-256 checksum next to it. Usage: tools/pack-gallery.sh <version>
# Tests, tools and CI files stay out; the archive is what the rider promises.
set -eu
version=${1:?usage: tools/pack-gallery.sh <version>}
cd "$(dirname "$0")/.."
name="conspace-rooms-$version"
mkdir -p dist
git archive --format=zip --prefix="$name/" -o "dist/$name.zip" HEAD \
  ':(exclude)tests' ':(exclude)tools' ':(exclude).github'
(cd dist && shasum -a 256 "$name.zip" > "$name.zip.sha256")
cat "dist/$name.zip.sha256"
