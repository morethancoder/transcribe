# Transcribe — project notes for Claude

Local transcription app: SvelteKit web app + Node server, wrapped by Tauri for
desktop and Android. `docs/STACK.md` inventories the stack,
`docs/ARCHITECTURE.md` explains the layout, `docs/MOBILE.md` the mobile story,
`CONTRIBUTING.md` the house style.

## Naming (it's inconsistent on purpose — don't "fix" it)

- App/product name: **Transcribe**; repo: `morethancoder/transcribe`
- Rust crate, binary, and release-asset prefix: **transcrape** (historical)
- Android bundle identifier: `com.morethancoder.transcribe` — changing it makes
  every phone treat the next APK as a different app (no in-place update, data
  lost). Never change it again.

## The Makefile is the CLI

One-word lowercase targets, `## description` self-docs, anything over three
lines goes in `scripts/<verb>.sh` sourcing `scripts/_lib.sh`. Run bare `make`
for the list. Use the targets instead of raw pnpm/cargo/gh where one exists.

## Releasing

**Always `make release`** (`scripts/release.sh`) — never bump versions, tag,
or touch the releases page by hand. It bumps `package.json`,
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (+ `Cargo.lock`) in
lockstep, rolls `CHANGELOG.md`'s `[Unreleased]` section into the new version,
commits `Cut X.Y.Z`, tags `vX.Y.Z`, pushes, and watches CI.

- `.github/workflows/release.yml` triggers on `v*` tags. It builds server
  archives, desktop bundles, and a signed APK onto a **draft** release, then a
  final `publish` job flips it public once every artifact is attached. If a
  release ever looks missing, check for a stuck draft: `gh release list`.
- A failed build leaves the draft unpublished by design — don't publish a
  partial draft; fix and re-run the workflow.
- Changelog entries are written under `## [Unreleased]` at PR time, not at
  release time.

## Android specifics

- `src-tauri/gen/android` is generated (`pnpm tauri android init`) and
  gitignored. Anything that must live inside it — currently
  `KeepAliveService.kt` and its manifest entries — is injected by
  `scripts/android-service.sh`, which CI runs after every init. Never edit
  gen/android expecting it to stick.
- The keep-alive foreground service (background downloads) is driven from
  `src-tauri/src/keepalive.rs` via wry's `JniHandle` — no extra crates.
  `cargo check --target aarch64-linux-android` works on this machine (NDK
  installed; set `NDK_HOME`/`CMAKE_ANDROID_NDK` and the NDK clang as
  `CC_aarch64_linux_android`) and is the way to validate Android-only Rust
  before a release build.
- The default model is platform-dependent (`engine/model.rs`): Small on
  Android/iOS, `large-v3-turbo` on desktop — turbo doesn't fit in a phone's
  memory budget.

## Logging

The engine logs into `src-tauri/src/logs.rs` (ring buffer + file in the app
log dir), surfaced at Settings → Developer → Logs. Frontend errors are
forwarded into the same buffer via the `log_event` command. When debugging a
user-reported mobile failure, ask for a copy from that screen.

## Checks

`make check` (svelte-check) and `make build` are what CI runs; keep both clean
before committing. There's no test suite — say what you ran a server change
against.
