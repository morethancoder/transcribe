# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] — 2026-08-02

### Added

- **A log the phone can show.** Settings gains a Developer section linking to a
  Logs screen: every download, decode, and whisper run — and every error, from
  the engine or the UI — lands in one prettified, copyable list. Mirrored to a
  file that survives a crash. Until now a failure on a phone left nothing to
  look at.
- **Downloads survive the background on Android.** A `dataSync` foreground
  service (injected by `scripts/android-service.sh`, since `tauri android
  init` regenerates the project) holds the process and a wakelock while a
  download or run is active, so switching apps or turning the screen off no
  longer freezes them.

### Changed

- **Phones now default to the Small model.** The previous default,
  `large-v3-turbo`, needs roughly a gigabyte just to load — which mid-range
  phones refuse, and was the likely reason transcription failed outright on
  Android. Desktop keeps turbo; every model remains available in the picker.

### Fixed

- The progress bar no longer sits on "Estimating time…" for entire mobile
  runs: the media duration now reaches the UI right after decoding instead of
  at the very end, so the ETA fallback engages while whisper is still warming
  up.

## [0.3.0] — 2026-08-02

### Added

- **Arabic, with full RTL.** Settings gains an App language choice — English,
  العربية, or System (the default, which follows the device language). The
  whole UI is translated and flips direction live, transcript lines set their
  own direction from their words (`dir="auto"`), and the choice is resolved
  before first paint so Arabic never flashes in left-to-right.
- **Update notice.** The app asks GitHub Releases (once per session) whether a
  newer version exists, and shows a dismissable banner plus a note in Settings
  → About linking to the release. Detection only — no self-updating.
- The app build now shows the poster frame and plays back the picked file,
  served over Tauri's asset protocol with a scope that only ever contains the
  files actually picked.
- Settings shows a real progress bar, with sizes, while a model downloads.

### Fixed

- The app build never started model downloads — the model sat at "missing"
  forever and the Transcribe button stayed disabled. Asking for model status
  now starts the download exactly as the web build's `/api/model` does, and
  concurrent requests for the same model are serialised in Rust so they can't
  corrupt the partial file.

### Changed

- Renamed to **Transcribe** — product name, window title, app labels, the
  repository (now `morethancoder/transcribe`; GitHub redirects the old URLs),
  and the bundle identifier (now `com.morethancoder.transcribe`). The
  identifier change means phones treat the next release as a new app: install
  it alongside, then remove the old one.

## [0.2.0] — 2026-08-01

### Added

- **Native apps via Tauri v2** for macOS, Windows, Linux and Android, sharing
  the web UI. The transcription engine is reimplemented in Rust
  (`src-tauri/src/engine/`) — symphonia decodes in place of ffmpeg, whisper.cpp
  is linked in directly via whisper-rs in place of `whisper-cli` — because
  mobile platforms can't shell out to external binaries. iOS builds from source
  with a free Apple ID (`docs/MOBILE.md`); Apple permits no direct download.
- **Model choice** in Settings: six Whisper models from Tiny (31 MB) to
  Large v3 (1.03 GB), with honest trade-off notes and per-device suggestions —
  Small on phones, Large v3 Turbo on desktop. Any model on any device. Choosing
  a model that can translate makes "Translate to English" reuse it instead of
  downloading a second model.
- **Settings screen**: model, default spoken language, Light/Dark/System theme
  (System keeps following the OS), and an About section.
- Release workflow: tagging `v*` drafts a GitHub Release with desktop bundles,
  a signed Android APK, the portable server archives and checksums.
- Rotating status lines and a moving sheen on the progress bar, so long
  whisper runs read as alive between its 5% progress ticks.

### Changed

- The mobile-first pass: the drop zone is now itself the file picker (tap to
  choose), phone-landscape layouts fit, filenames wrap sanely, and safe-area
  insets are respected.
- Model configuration env vars: `WHISPER_MODEL`/`WHISPER_MODEL_URL`/
  `WHISPER_TRANSLATE_MODEL`/`WHISPER_TRANSLATE_MODEL_URL` are replaced by
  `WHISPER_MODEL_ID` and `WHISPER_MODEL_DIR`, now that the model is a choice
  rather than a file path.

### Known limitations

- The native apps decode MP3, AAC, M4A/MP4, FLAC, WAV, ALAC, Vorbis and Ogg —
  **not Opus** (most `.webm` audio). The server build is unaffected, since
  ffmpeg does its decoding.

## [0.1.0] — 2026-07-31

First public release.

### Added

- Transcription of any video or audio file ffmpeg can open, via whisper.cpp, with
  automatic or explicit language selection.
- Streaming progress with a time estimate and a working cancel, over NDJSON.
- Playback with the current line highlighted and the spoken word lit up inside
  it; click a word or timestamp to seek.
- Inline editing that saves as you type and feeds the exports.
- `.txt` and `.srt` export, and copy-to-clipboard.
- Translation of a finished transcript to English, as a second whisper pass with
  the full multilingual model.
- History of every transcript in the browser's localStorage, with playback and
  translation re-using the decoded audio the server keeps for six hours.
- On-demand, resumable model downloads with progress in the UI.
- `make build` produces release archives for `darwin-arm64`, `darwin-x64`,
  `linux-x64`, `linux-arm64` and `win-x64`, plus `SHA256SUMS`.
- `make doctor` / `make setup` for first-run tool checks and install.

[Unreleased]: https://github.com/morethancoder/transcribe/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/morethancoder/transcribe/releases/tag/v0.4.0
[0.3.0]: https://github.com/morethancoder/transcribe/releases/tag/v0.3.0
[0.2.0]: https://github.com/morethancoder/transcribe/releases/tag/v0.2.0
[0.1.0]: https://github.com/morethancoder/transcribe/releases/tag/v0.1.0
