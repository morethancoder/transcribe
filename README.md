# Transcrape

Local video/audio transcription. Pick a file, get a transcript in any language —
everything runs on-device with [whisper.cpp](https://github.com/ggml-org/whisper.cpp),
nothing is uploaded anywhere.

Built with SvelteKit (Svelte 5) and [MoreThanUI](https://www.npmjs.com/package/morethanui).
Ships two ways: a local web server (this page), and native apps via
[Tauri v2](https://v2.tauri.app) for desktop and Android — grab those from the
[releases page](https://github.com/morethancoder/transcribe/releases). iOS can't
be installed from a download (Apple doesn't allow it); it builds from source
with a free Apple ID — see [docs/MOBILE.md](docs/MOBILE.md).

![ci](https://github.com/morethancoder/transcribe/actions/workflows/ci.yml/badge.svg)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## What it does

- **Transcribe** any video or audio file ffmpeg can open, in any language whisper
  supports — auto-detected, or pick one up front.
- **Follow along** with the file playing: the current line is highlighted and the
  word being spoken lights up inside it. Click a word to jump to it, or a
  timestamp to jump to the line.
- **Edit** the text inline. Edits save as you type and feed the exports.
- **Export** `.txt` or `.srt`, or copy the whole thing.
- **Translate** a finished transcript to English.
- **History** of every transcript, kept in the browser's localStorage.

## Requirements

| | |
| --- | --- |
| Node | 22 or newer |
| pnpm | any recent version (development only) |
| `ffmpeg` / `ffprobe` | decodes the source file to 16 kHz mono WAV |
| `whisper-cli` | from whisper.cpp — does the transcription |

```sh
# macOS — whisper runs on the GPU through Metal
brew install node pnpm ffmpeg whisper-cpp

# Debian/Ubuntu — ffmpeg is packaged, whisper.cpp has to be built
sudo apt install ffmpeg
# then build https://github.com/ggml-org/whisper.cpp and put whisper-cli on PATH

# Windows
winget install OpenJS.NodeJS Gyan.FFmpeg
# then grab a whisper.cpp release binary and set WHISPER_CLI in .env
```

Binaries are looked up on the PATH plus the usual package-manager prefixes
(`/opt/homebrew/bin`, `/usr/local/bin`, `/snap/bin`, `~/.local/bin`). Set
`WHISPER_CLI`, `FFMPEG` or `FFPROBE` in `.env` to override.

## Run it

```sh
make setup   # checks tools (make doctor) + installs dependencies
make dev     # dev server on :5173
```

Open <http://localhost:5173> and drop in a video or audio file.

Run bare `make` for the full target list:

| Target | Does |
| --- | --- |
| `make doctor` | check the tools and models this machine has |
| `make setup` | doctor, then install dependencies |
| `make dev` | dev server on :5173 |
| `make build` | release archives for every platform, into `dist/` |
| `make start` | run the production server out of `build/` |
| `make preview` | serve the production build locally |
| `make check` | type-check with `svelte-check` |
| `make release` | bump the version, tag, and publish a GitHub release via CI |
| `make clean` | drop build output and caches (keeps `models/`) |

## Building for other platforms

```sh
make build                        # all five targets
PLATFORMS=linux-x64 make build    # just one
```

`dist/` gets one archive per platform plus a `SHA256SUMS`:

| Platform | Archive |
| --- | --- |
| `darwin-arm64`, `darwin-x64` | `transcrape-<version>-<platform>.tar.gz` |
| `linux-x64`, `linux-arm64` | `transcrape-<version>-<platform>.tar.gz` |
| `win-x64` | `transcrape-<version>-win-x64.zip` |

The server itself is portable JavaScript — SvelteKit's
[`adapter-node`](https://svelte.dev/docs/kit/adapter-node) bundles the whole app
into `build/`, and there are no native dependencies. What differs per platform is
the launcher (`./transcrape` vs `transcrape.cmd`), the archive format, and the
`INSTALL.md` shipped inside with the right install commands. So the build runs on
any one machine and produces every target — that's what CI does.

Unpack an archive anywhere and run it:

```sh
tar -xzf transcrape-0.1.0-darwin-arm64.tar.gz
cd transcrape-0.1.0-darwin-arm64
./transcrape        # http://127.0.0.1:5173
```

Node still has to be installed, and so do ffmpeg and whisper-cli — the archives
don't bundle them. `HOST`, `PORT` and `BODY_SIZE_LIMIT` are read from the
environment or from a `.env` next to the launcher.

## Models

Pick one in **Settings → Transcription**. Bigger models hear better and take
longer; every one is available on every device, so a phone can run the largest
if you want it to. Downloads go into `models/` on demand, show progress, and
resume if interrupted.

| Model | Size | Translates | Good for |
| --- | --- | --- | --- |
| `tiny` | 31 MB | yes | an old phone, or a rough first pass |
| `base` | 60 MB | yes | clear speech in a quiet room |
| `small` | 190 MB | yes | **suggested on phones** — the usable/fast balance |
| `medium` | 539 MB | yes | hard audio, on a laptop |
| `large-v3-turbo` | 574 MB | **no** | **suggested on desktop** — the default |
| `large-v3` | 1.03 GB | yes | the most accurate, ~2× turbo's time |

Sizes are the real download; all are `q5` quantised, roughly a third of the
float original for no audible difference in a transcript.

The turbo default is transcription-only: it silently ignores whisper's `-tr`
flag and returns the source language. So "Translate to English" is a separate
step on a finished transcript, and with turbo selected it downloads `medium`
alongside. **Choosing any other model makes translation free** — it reuses the
model already on disk.

Switching models leaves the old one in place, so switching back is instant. The
choice is remembered in `models/selected.json`; `WHISPER_MODEL_ID` pins it for a
headless install.

## How it works

Videos show a poster frame, grabbed in the browser — the file isn't uploaded
until you press Transcribe. Language is auto-detected (or pick one under
"Spoken language"). While it runs you get a progress bar with a time estimate,
and you can cancel.

Word timings come from whisper's own token offsets (`-ojf`), so they're
approximate — good enough to follow along, not frame-accurate. Editing a line
drops its word timings, since they describe the wording that was replaced; that
line falls back to whole-line highlighting.

Every transcript is saved to **History** (in this browser's localStorage — it
never leaves the machine either). Playback and translation from history re-use
the decoded audio the server keeps for a few hours; that audio is what Whisper
was fed, so it's sound only even for a video. After it expires the transcript
stays readable and editable, but the file has to be transcribed again to play
or translate it.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the layout of the code.

## Configuration

Everything is optional — copy `.env.example` to `.env` and uncomment what you
need.

| Variable | Default | |
| --- | --- | --- |
| `WHISPER_CLI` | discovered | path to the whisper.cpp CLI |
| `FFMPEG`, `FFPROBE` | discovered | paths to the ffmpeg binaries |
| `WHISPER_MODEL_ID` | chosen in the UI | pin the model — see [Models](#models) |
| `WHISPER_MODEL_DIR` | `models` | where the `.bin` files are kept |
| `JOB_TTL_MS` | `21600000` (6 h) | how long decoded audio stays on disk |
| `MAX_JOBS` | `20` | how many decoded jobs are kept |
| `HOST`, `PORT` | `127.0.0.1`, `5173` | production server only |
| `BODY_SIZE_LIMIT` | `Infinity` | upload cap, production server only |

## Privacy

No audio, video or text leaves the machine. The only outbound requests the app
makes are the two model downloads from Hugging Face, and they can be pointed
elsewhere or pre-seeded by dropping the `.bin` files into `models/` yourself.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
