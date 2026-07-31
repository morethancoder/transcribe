# Architecture

Transcrape is a SvelteKit app that runs on the same machine as the person using
it. The server exists only to drive two command-line programs — `ffmpeg` and
`whisper-cli` — and to stream their progress back to the browser. There is no
database, no account, and no outbound traffic other than the model downloads.

## Layout

```
src/
  app.css               MoreThanUI tokens + the handful of app-level styles
  app.html              document shell
  hooks.server.ts       boot hooks: start the model download, reap stale work dirs
  lib/
    components/         Player, Progress, Transcript — the whole UI
    server/             everything that touches the filesystem or spawns a process
      proc.ts             spawn wrapper: line-buffered output, abort, timeouts
      media.ts            ffprobe duration + ffmpeg decode to 16 kHz mono WAV
      whisper.ts          whisper-cli invocation and JSON → segments/words
      model.ts            resumable model downloads and their state
      jobs.ts             the decoded-audio registry, its TTL and its sweeper
      ndjson.ts           streaming response helper
    format.ts           timestamps, sizes, .srt/.txt export, download trigger
    history.ts          localStorage transcript store + speed estimate
    job.svelte.ts       client-side driver for one streaming /api call
    languages.ts        the language list and its codes
    ndjson.ts           client-side NDJSON reader
    thumbnail.ts        poster frame grabbed from a video in the browser
    types.ts            Segment, Word, Phase, ProgressEvent — shared client/server
  routes/
    +layout.svelte      shell, nav, theme
    +page.svelte        pick a file → transcribe → transcript
    history/            saved transcripts, and one transcript by id
    api/
      transcribe/       POST: upload → decode → whisper → segments
      translate/        POST: re-run whisper with -tr over a kept job
      audio/            GET: the kept WAV, with range support, for playback
      model/            GET: model download state, for the boot progress UI
scripts/                every make target's implementation
docs/upstream/          bug reports filed against MoreThanUI while building this
```

## The transcription path

1. The browser reads the file locally: size, kind, and for a video a poster
   frame off a `<canvas>`. Nothing is sent yet.
2. `POST /api/transcribe` streams the raw file as the request body, with the
   language in a query param. It is deliberately **not** multipart — undici's
   parser buffers the whole body and rejects exotic filenames (emoji, ornamental
   unicode), which 500s the upload before the handler ever runs.
3. The handler pipes the body straight to a temp dir, probes the duration, and
   hands it to `ffmpeg -ac 1 -ar 16000` — the shape whisper.cpp wants. The source
   file is deleted as soon as it is decoded.
4. `whisper-cli` runs against the WAV with `-oj -ojf`, so the JSON carries
   per-token offsets. `whisper.ts` folds sub-word tokens back into whole words to
   get the word timings the UI highlights with.
5. The decoded WAV is kept, keyed by job id, so playback and translation don't
   need a second upload.

## Progress is an NDJSON stream

A transcription can run for minutes, so the endpoints don't resolve to one JSON
body — they return a newline-delimited stream of `ProgressEvent`s
(`src/lib/types.ts`), and the last one is `done` or `error`. This matters in two
places:

- **Failures after the first byte** arrive as an `error` event. The status line
  is long gone by then, so there is no other way to report them.
- **A closed tab** has to stop the work. `request.signal` stays open on a dropped
  connection, so `src/lib/server/ndjson.ts` aborts from the stream's own
  `cancel()` instead, which kills the whisper child.

The server owns the weighting between phases — only it knows whether a model
download is about to happen — so `progress` is always whole-run completion,
0..1. `JobRun` (`src/lib/job.svelte.ts`) consumes the stream and re-anchors its
ETA at every phase boundary, because the phases run at wildly different speeds.

## Two models, on purpose

`large-v3-turbo` is fast but transcription-only: it silently ignores `-tr` and
returns the source language. Translation therefore runs as a second pass with
the full multilingual `medium` model, downloaded the first time someone asks for
it. `model.ts` keeps download state in memory, writes to a `.download` partial,
and resumes with a `Range` request when the server supports it.

## What lives where

| State | Where | Lifetime |
| --- | --- | --- |
| Transcripts, edits, translations | browser localStorage | until cleared |
| Decoded WAV per job | OS temp dir | `JOB_TTL_MS`, default 6 h |
| Models | `models/` next to the app | forever, re-downloaded if deleted |

The job registry is an in-memory `Map`, so a restart orphans its temp dirs.
`reapOrphans()` clears `transcrape-*` dirs older than ten minutes at boot — age
gated, so a second dev server doesn't delete the job the first one just made.

## Deployment shape

`adapter-node` bundles the app into `build/`, which runs under plain Node with no
native dependencies. `scripts/build.sh` wraps that one bundle into per-platform
archives that differ only in launcher and archive format. It is not deployable to
a serverless host — the app spawns processes and writes to disk by design.
