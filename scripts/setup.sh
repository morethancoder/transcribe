#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_lib.sh
load_env

bash scripts/doctor.sh

step "Installing dependencies"
pnpm install

ok "setup complete — run 'make dev' to start (the whisper model downloads itself on first launch)"
