#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_lib.sh
load_env

# Builds the SvelteKit app once with adapter-node, then wraps that single
# portable bundle into one archive per platform. The server itself is plain
# JavaScript — what differs per platform is the launcher (sh vs cmd), the
# archive format (tar.gz vs zip) and the install hints in the bundled notes.

PLATFORMS="${PLATFORMS:-darwin-arm64 darwin-x64 linux-x64 linux-arm64 win-x64}"
VERSION="$(node -p "require('./package.json').version")"
DIST="dist"

require_cli node "install via https://nodejs.org or 'brew install node'"
require_cli pnpm "install via 'npm i -g pnpm' or 'brew install pnpm'"

step "Building the app (v$VERSION)"
pnpm build
[ -f build/index.js ] || { err "adapter-node produced no build/index.js"; exit 1; }
ok "server bundle ready ($(du -sh build | cut -f1))"

step "Packaging for: $PLATFORMS"
rm -rf "$DIST"
mkdir -p "$DIST"

for platform in $PLATFORMS; do
  name="transcrape-$VERSION-$platform"
  stage="$DIST/$name"

  mkdir -p "$stage"
  cp -R build "$stage/build"
  cp .env.example README.md LICENSE "$stage/"
  node scripts/manifest.mjs "$platform" > "$stage/package.json"
  bash scripts/notes.sh "$platform" "$VERSION" > "$stage/INSTALL.md"

  case "$platform" in
    win-*)
      cp scripts/launcher.cmd "$stage/transcrape.cmd"
      ( cd "$DIST" && zip -qr "$name.zip" "$name" )
      ok "$name.zip"
      ;;
    *)
      cp scripts/launcher.sh "$stage/transcrape"
      chmod +x "$stage/transcrape"
      ( cd "$DIST" && tar -czf "$name.tar.gz" "$name" )
      ok "$name.tar.gz"
      ;;
  esac

  rm -rf "$stage"
done

step "Writing checksums"
if command -v shasum >/dev/null 2>&1; then
  sha() { shasum -a 256 "$@"; }
else
  sha() { sha256sum "$@"; }
fi
# The glob is resolved into a variable first so SHA256SUMS can't checksum itself.
archives=$(cd "$DIST" && ls -- *.tar.gz *.zip 2>/dev/null || true)
# shellcheck disable=SC2086
( cd "$DIST" && sha $archives > SHA256SUMS )
ok "$DIST/SHA256SUMS"

say ""
ok "done — archives in $DIST/"
say "   each one unpacks to a folder you run with ./transcrape (or transcrape.cmd)"
