# Contributing

Thanks for taking a look. Issues and pull requests are welcome.

## Getting set up

```sh
git clone https://github.com/morethancoder/transcrape.git
cd transcrape
make setup   # checks node, pnpm, ffmpeg, whisper-cli — then installs deps
make dev
```

`make doctor` on its own tells you what's missing and how to install it. The
transcription model (~547 MB) downloads itself the first time the server starts;
you don't need to fetch anything by hand.

## Before you open a PR

```sh
make check   # svelte-check — must be clean
make build   # must produce every archive in dist/
```

CI runs exactly these two. There's no test suite yet — if you're touching
`src/lib/server/`, say in the PR what you ran the change against (file type,
length, language), since that's the part with no automated coverage.

## House style

- **Makefile**: one-word lowercase targets, self-documented with a trailing
  `## description`. Anything longer than three lines lives in `scripts/<verb>.sh`
  and sources `scripts/_lib.sh`.
- **Svelte 5 runes** throughout — the project forces runes mode in
  `vite.config.ts`.
- **Tabs**, single quotes, no semicolon-free style. `.editorconfig` has the rest.
- **Comments explain why, not what.** The codebase leans on this heavily: the
  reason `/api/transcribe` avoids multipart, the reason there are two models, the
  reason the ETA re-anchors per phase. Keep that up — a comment restating the
  line below it is noise.
- **Components** go in `src/lib/components/`, anything that spawns a process or
  touches the filesystem goes in `src/lib/server/`, shared types in
  `src/lib/types.ts`.

## Scope

Transcrape is deliberately a local, single-user tool. Changes that assume a
shared server, multiple users, or a hosted deployment are out of scope — the job
registry is an in-memory `Map` and history lives in localStorage precisely
because there's nothing to coordinate.

Good things to work on: more export formats, better word-timing handling on
edited lines, speaker labels, batch transcription, packaging (a real installer
would be very welcome).

## Reporting a bug

Include the OS, the output of `make doctor`, the file type and rough length, and
whatever the server printed. If it's a transcription-quality problem rather than
a crash, mention which model — they behave quite differently.
