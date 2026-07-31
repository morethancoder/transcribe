#!/usr/bin/env bash
# Prints the INSTALL.md that ships inside one dist archive. Called by
# scripts/build.sh as: notes.sh <platform> <version>
set -euo pipefail

platform="${1:?usage: notes.sh <platform> <version>}"
version="${2:?usage: notes.sh <platform> <version>}"

case "$platform" in
  darwin-*)
    deps='brew install ffmpeg whisper-cpp'
    deps_note='Homebrew — https://brew.sh. Whisper runs on the GPU through Metal.'
    launch='./transcrape'
    quarantine=$'\nmacOS quarantines files downloaded with a browser. If the launcher\nrefuses to start, clear the flag once:\n\n```sh\nxattr -dr com.apple.quarantine .\n```\n'
    ;;
  linux-*)
    deps='sudo apt install ffmpeg   # then build whisper.cpp, see below'
    deps_note='Most distros package ffmpeg but not whisper.cpp. Build it from
https://github.com/ggml-org/whisper.cpp and put `whisper-cli` on your PATH
(or point `WHISPER_CLI` at it in `.env`).'
    launch='./transcrape'
    quarantine=''
    ;;
  win-*)
    deps='winget install Gyan.FFmpeg'
    deps_note='whisper.cpp has no winget package — grab a release binary from
https://github.com/ggml-org/whisper.cpp/releases and point `WHISPER_CLI` at
`whisper-cli.exe` in `.env`.'
    launch='transcrape.cmd'
    quarantine=''
    ;;
  *)
    echo "unknown platform: $platform" >&2
    exit 1
    ;;
esac

cat <<EOF
# Transcrape $version — $platform

## 1. Install Node

Node 22 or newer: https://nodejs.org

## 2. Install the media tools

\`\`\`sh
$deps
\`\`\`

$deps_note

## 3. Run it

\`\`\`sh
$launch
\`\`\`

Then open http://127.0.0.1:5173.

The first launch downloads the transcription model (~547 MB) into \`models/\`
next to this file; the translation model (~515 MB) follows the first time you
translate something. Interrupted downloads resume.
$quarantine
## Configuration

Copy \`.env.example\` to \`.env\` and uncomment what you need — binary paths,
model paths and URLs, job retention. \`HOST\`, \`PORT\` and \`BODY_SIZE_LIMIT\`
work there too.

Everything runs on this machine. No audio, video or text is uploaded anywhere.
EOF
