#!/usr/bin/env bash
# Cut a release end to end: bump the version everywhere it lives, roll the
# changelog, tag, push, then wait for CI to build and publish the GitHub
# Release. One command, no manual steps on the releases page afterwards.
#
#   make release              # prompts for the version (suggests a minor bump)
#   VERSION=1.0.0 make release
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_lib.sh
load_env

REPO_URL="https://github.com/morethancoder/transcribe"

step "Preflight"
require_cli git "https://git-scm.com"
require_cli gh "brew install gh (then: gh auth login)"
require_cli node "https://nodejs.org"
require_cli cargo "https://rustup.rs"
gh auth status >/dev/null 2>&1 || { err "gh is not authenticated — run: gh auth login"; exit 1; }

# Releases only ever come from a clean, pushed main — the tag must point at
# exactly what CI will check out.
[ -z "$(git status --porcelain)" ] || { err "working tree is dirty — commit or stash first"; exit 1; }
branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = "main" ] || { err "releases are cut from main (you're on $branch)"; exit 1; }
git fetch origin main --quiet
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  err "main and origin/main differ — pull or push first"
  exit 1
fi
ok "clean tree, on main, in sync with origin"

current=$(node -p "require('./package.json').version")
IFS=. read -r maj min _pat <<<"$current"
default="$maj.$((min + 1)).0"

if [ -z "${VERSION:-}" ]; then
  printf '%s?%s new version [%s]: ' "$C_YELLOW" "$C_RESET" "$default"
  read -r VERSION
  VERSION=${VERSION:-$default}
fi
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { err "not a plain semver version: $VERSION"; exit 1; }
tag="v$VERSION"
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  err "tag $tag already exists"
  exit 1
fi

step "Bumping $current → $VERSION"
# The version lives in three files that must never drift apart; the Android
# build derives its versionName from tauri.conf.json, cargo from Cargo.toml.
perl -pi -e "s/\"version\": \"\Q$current\E\"/\"version\": \"$VERSION\"/" package.json src-tauri/tauri.conf.json
perl -pi -e "s/^version = \"\Q$current\E\"/version = \"$VERSION\"/" src-tauri/Cargo.toml
(cd src-tauri && cargo update -p transcrape --offline >/dev/null 2>&1) || (cd src-tauri && cargo update -p transcrape >/dev/null)
ok "package.json, tauri.conf.json, Cargo.toml, Cargo.lock"

# Roll CHANGELOG.md: whatever sat under [Unreleased] becomes this version's
# section, and the compare links at the bottom move along with it.
if grep -q '^## \[Unreleased\]' CHANGELOG.md; then
  today=$(date +%F)
  perl -pi -e "s/^## \[Unreleased\]$/## [Unreleased]\n\n## [$VERSION] — $today/" CHANGELOG.md
  perl -pi -e "s|^\[Unreleased\]:.*|[Unreleased]: $REPO_URL/compare/$tag...HEAD\n[$VERSION]: $REPO_URL/releases/tag/$tag|" CHANGELOG.md
  ok "CHANGELOG.md rolled — [Unreleased] → [$VERSION]"
else
  warn "CHANGELOG.md has no [Unreleased] section — skipping the roll"
fi

say ""
git --no-pager diff --stat
confirm "commit, tag $tag, and push? CI will build and publish the release" || {
  warn "aborted — reverting the bump"
  git checkout -- package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock CHANGELOG.md
  exit 1
}

step "Tagging and pushing"
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock CHANGELOG.md
git commit -m "Cut $VERSION"
git tag "$tag"
git push origin main "$tag"

step "Waiting for the release workflow (Ctrl-C is safe — CI keeps going)"
# The run appears a few seconds after the tag lands; poll for its id first.
run_id=""
for _ in $(seq 1 12); do
  run_id=$(gh run list --workflow release.yml --limit 10 \
    --json databaseId,headBranch \
    -q ".[] | select(.headBranch == \"$tag\") | .databaseId" | head -1)
  [ -n "$run_id" ] && break
  sleep 5
done
[ -n "$run_id" ] || { err "couldn't find the workflow run — check: gh run list --workflow release.yml"; exit 1; }
say "   watching run $run_id"
gh run watch "$run_id" --exit-status --interval 30 >/dev/null

# CI's publish job flips the draft public itself; this is a belt-and-braces
# check so the script never reports success on a still-hidden release.
if [ "$(gh release view "$tag" --json isDraft -q .isDraft)" = "true" ]; then
  warn "release was still a draft — publishing it now"
  gh release edit "$tag" --draft=false --latest
fi

say ""
ok "$tag is live: $REPO_URL/releases/tag/$tag"
say "   APK: transcrape-$VERSION.apk on that page (installs alongside nothing —"
say "   same bundle id updates in place)"
