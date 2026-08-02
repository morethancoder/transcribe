# Stack

What Transcribe is built with, at a glance. `ARCHITECTURE.md` explains how the
pieces fit; this is just the inventory.

## Frontend

- **Svelte 5** (runes mode forced in `vite.config.ts`) on **SvelteKit 2**,
  built by **Vite 8**, typed with **TypeScript** and checked by `svelte-check`
- **morethanui** for UI components
- English + Arabic with full RTL; language resolved before first paint
- History, edits, and translations live in browser **localStorage** — no
  database anywhere

## Two builds from one codebase

`TRANSCRAPE_TARGET=app` at build time flips the SvelteKit adapter:

| | Web/server build | App build (desktop + Android) |
| --- | --- | --- |
| Adapter | `adapter-node` → `build/index.js` | `adapter-static` → Tauri webview |
| Runtime | **Node ≥ 22**, pnpm 11 | **Tauri 2** (Rust 2021, min 1.77.2) |
| Transcription | spawns **whisper-cli** (whisper.cpp) | **whisper-rs** 0.16 in-process |
| Audio decode | spawns **ffmpeg** | **symphonia** (aac/alac/mp4/mp3) |
| Model download | Node fetch, resumable | **reqwest** (rustls) + **tokio** |

Whisper models: `large-v3-turbo` for transcription, full `medium` for the
translation pass — downloaded on demand into `models/`, resumable.

## Tauri app specifics

- Plugins: `dialog` (file picking), `fs`; `protocol-asset` scoped to exactly
  the one picked file for media preview
- App code lives in the lib crate (`transcrape_lib`) so Android/iOS can load
  it; `main.rs` is a desktop-only shim
- Release profile: LTO, `codegen-units = 1`, stripped — inference speed over
  build time
- Android: bundle id `com.morethancoder.transcribe`, aarch64, NDK 28 /
  platform 35 / Java 21 in CI, signed with a keystore held as CI secrets
  (`scripts/android-sign.sh`). No iOS — Apple won't allow sideloading

## Tooling & CI

- **Makefile as the CLI** (one-word targets → `scripts/*.sh`); `make release`
  cuts and publishes a release end to end
- GitHub Actions: `ci.yml` runs `make check` + `make build`; `release.yml`
  (on `v*` tags) builds server archives, desktop bundles (dmg / AppImage /
  deb / msi / exe via `tauri-action`), and the signed APK, then auto-publishes
- Version lives in `package.json`, `src-tauri/tauri.conf.json`, and
  `src-tauri/Cargo.toml`, kept in lockstep by `make release`
