# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
