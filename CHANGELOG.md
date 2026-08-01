# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/morethancoder/transcrape/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/morethancoder/transcrape/releases/tag/v0.1.0
