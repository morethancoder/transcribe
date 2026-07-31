#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_lib.sh
load_env

# Install hints differ per OS, and so do the prefixes the app probes when a
# binary isn't on the PATH — keep both in step with src/lib/server/proc.ts.
case "$(uname -s)" in
  Darwin)
    node_hint="install via https://nodejs.org or 'brew install node'"
    pnpm_hint="install via 'npm i -g pnpm' or 'brew install pnpm'"
    ffmpeg_hint="install via 'brew install ffmpeg'"
    whisper_hint="install via 'brew install whisper-cpp'"
    extra_dirs="/opt/homebrew/bin /usr/local/bin /usr/bin"
    ;;
  *)
    node_hint="install via https://nodejs.org or your package manager"
    pnpm_hint="install via 'npm i -g pnpm'"
    ffmpeg_hint="install via 'sudo apt install ffmpeg' or your package manager"
    whisper_hint="build https://github.com/ggml-org/whisper.cpp, then put whisper-cli on the PATH or set WHISPER_CLI"
    extra_dirs="/usr/local/bin /usr/bin /bin /snap/bin $HOME/.local/bin"
    ;;
esac

step "Checking required tools"
fail=0
require_cli node "$node_hint" || fail=1
require_cli pnpm "$pnpm_hint" || fail=1
require_cli ffmpeg "$ffmpeg_hint" || fail=1

# whisper-cli often lives outside the PATH; the app probes the same prefixes
if [ -n "${WHISPER_CLI:-}" ] && [ -x "$WHISPER_CLI" ]; then
  ok "whisper-cli ($WHISPER_CLI, from \$WHISPER_CLI)"
elif command -v whisper-cli >/dev/null 2>&1; then
  ok "whisper-cli ($(command -v whisper-cli))"
else
  found=""
  for dir in $extra_dirs; do
    if [ -x "$dir/whisper-cli" ]; then found="$dir/whisper-cli"; break; fi
  done
  if [ -n "$found" ]; then
    ok "whisper-cli ($found)"
  else
    err "missing CLI: whisper-cli — $whisper_hint"
    fail=1
  fi
fi

if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$node_major" -ge 22 ]; then
    ok "node $(node -v) meets the >=22 requirement"
  else
    err "node $(node -v) is too old — transcrape needs 22 or newer"
    fail=1
  fi
fi

step "Checking project state"
if [ -d node_modules ]; then
  ok "node_modules present"
else
  warn "node_modules missing — run 'make setup'"
fi

model="${WHISPER_MODEL:-models/ggml-large-v3-turbo-q5_0.bin}"
if [ -f "$model" ]; then
  ok "transcription model present ($model)"
else
  warn "transcription model missing — downloaded automatically on first launch (~547 MB)"
fi

translate_model="${WHISPER_TRANSLATE_MODEL:-models/ggml-medium-q5_0.bin}"
if [ -f "$translate_model" ]; then
  ok "translation model present ($translate_model)"
else
  warn "translation model missing — downloaded the first time you translate (~515 MB)"
fi

if [ "$fail" = "1" ]; then
  err "doctor found problems"
  exit 1
fi
ok "all good"
