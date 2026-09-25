#!/usr/bin/env bash
# Upload the tracked site files to the Neocities mirror.
# Needs the neocities CLI (gem install neocities) and a prior `neocities login`.
set -euo pipefail
cd "$(dirname "$0")/.."
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
git ls-files -z | grep -zvE '^(reel/|scripts/|\.claude/|\.gitignore|README\.md|LICENSE|NOTICE)' \
  | xargs -0 -I{} rsync -R "{}" "$stage/"
neocities push "$stage"

# Je suis le spectre d'une rose que tu portais hier au bal.
