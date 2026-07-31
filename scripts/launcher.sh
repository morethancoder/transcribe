#!/usr/bin/env bash
# Transcrape launcher — unpacked next to build/, run it from anywhere.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  printf '\033[31m ✗ \033[0mnode is not installed — get Node 22 or newer from https://nodejs.org\n' >&2
  exit 1
fi

# Models are downloaded next to this launcher, not into the user's home dir.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-5173}"
# Uploads are whole video files; adapter-node's 512 kB default would reject them.
export BODY_SIZE_LIMIT="${BODY_SIZE_LIMIT:-Infinity}"

printf '\033[36m==>\033[0m Transcrape on \033[1mhttp://%s:%s\033[0m  (ctrl-c to stop)\n' "$HOST" "$PORT"
exec node build/index.js
