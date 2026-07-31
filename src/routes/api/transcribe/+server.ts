import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import fs from 'node:fs/promises';
import path from 'node:path';
import { modelReady } from '$lib/server/model';
import { createWorkDir, keepJob } from '$lib/server/jobs';
import { probeDuration, toWav } from '$lib/server/media';
import { LANGUAGE_CODES } from '$lib/languages';
import { transcribe } from '$lib/server/whisper';
import { ndjson } from '$lib/server/ndjson';

/** Share of the bar the decode step gets; whisper dominates the rest. */
const DECODE_SHARE = 0.08;

// The file arrives as the raw request body (streamed to disk), with metadata in
// query params. Multipart/FormData is deliberately avoided: undici's parser
// buffers the whole body and rejects exotic filenames (emoji, ornamental
// unicode), which 500s the upload before we ever see it.
//
// The response is an NDJSON stream of progress events (see $lib/server/ndjson).
export const POST: RequestHandler = async ({ request, url }) => {
	if (!modelReady('transcribe')) {
		return json(
			{ message: 'Whisper model not found — it may still be downloading. Try again in a minute.' },
			{ status: 503 }
		);
	}

	const language = url.searchParams.get('language') ?? 'auto';
	if (!request.body) return json({ message: 'No file received.' }, { status: 400 });
	if (!LANGUAGE_CODES.has(language)) {
		return json({ message: `Unsupported language "${language}".` }, { status: 400 });
	}

	const { id, dir } = await createWorkDir();

	return ndjson(async (emit, signal) => {
		let keep = false;
		try {
			const inputPath = path.join(dir, 'input');
			const wavPath = path.join(dir, 'audio.wav');

			await pipeline(
				Readable.fromWeb(request.body as NodeReadableStream),
				createWriteStream(inputPath)
			);
			if ((await fs.stat(inputPath)).size === 0) throw new Error('No file received.');

			const durationMs = await probeDuration(inputPath);
			emit({ type: 'meta', jobId: id, durationMs });

			emit({ type: 'progress', phase: 'preparing', progress: 0 });
			await toWav(inputPath, wavPath, {
				durationMs,
				signal,
				onProgress: (p) =>
					emit({ type: 'progress', phase: 'preparing', progress: p * DECODE_SHARE })
			});
			// the source file is only needed for the decode step
			await fs.rm(inputPath, { force: true });

			emit({ type: 'progress', phase: 'transcribing', progress: DECODE_SHARE });
			const result = await transcribe({
				wavPath,
				language,
				translate: false,
				signal,
				onProgress: (p) =>
					emit({
						type: 'progress',
						phase: 'transcribing',
						progress: DECODE_SHARE + p * (1 - DECODE_SHARE)
					})
			});

			await keepJob({ id, dir, wavPath, language: result.language, createdAt: Date.now() });
			keep = true;
			emit({ type: 'done', ...result });
		} finally {
			// keep the WAV only for a job that can still be translated
			if (!keep) await fs.rm(dir, { recursive: true, force: true });
		}
	}, request.signal);
};
