import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { getJob } from '$lib/server/jobs';

/**
 * Serve a finished job's decoded WAV so a transcript opened from history can
 * still be played back. Only the 16 kHz mono audio survives the transcribe
 * request — the source video is deleted right after it's decoded — so this is
 * audio even for video uploads. Range requests are honoured; without them the
 * media element can't seek.
 */
export const GET: RequestHandler = ({ url, request }) => {
	const job = getJob(url.searchParams.get('job') ?? '');
	if (!job) error(410, 'The audio for this transcript is no longer on the server.');

	let size: number;
	try {
		size = statSync(job.wavPath).size;
	} catch {
		error(410, 'The audio for this transcript is no longer on the server.');
	}

	const common = {
		'content-type': 'audio/wav',
		'accept-ranges': 'bytes',
		'cache-control': 'no-store'
	};

	if (request.method === 'HEAD') {
		return new Response(null, { headers: { ...common, 'content-length': String(size) } });
	}

	const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
	if (!range) {
		return new Response(toWebStream(job.wavPath), {
			headers: { ...common, 'content-length': String(size) }
		});
	}

	// an open-ended suffix range ("bytes=-500") counts back from the end
	const [, rawStart, rawEnd] = range;
	const start = rawStart ? Number(rawStart) : Math.max(0, size - Number(rawEnd || 0));
	const end = rawStart ? Math.min(Number(rawEnd || size - 1), size - 1) : size - 1;

	if (!Number.isFinite(start) || start > end || start >= size) {
		return new Response(null, {
			status: 416,
			headers: { ...common, 'content-range': `bytes */${size}` }
		});
	}

	return new Response(toWebStream(job.wavPath, start, end), {
		status: 206,
		headers: {
			...common,
			'content-length': String(end - start + 1),
			'content-range': `bytes ${start}-${end}/${size}`
		}
	});
};

function toWebStream(path: string, start?: number, end?: number): ReadableStream {
	return Readable.toWeb(createReadStream(path, { start, end })) as WebReadableStream as ReadableStream;
}

export const HEAD: RequestHandler = (event) => GET(event) as Response;
