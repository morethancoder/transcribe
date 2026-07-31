import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getJob } from '$lib/server/jobs';
import { awaitModel, modelReady } from '$lib/server/model';
import { transcribe } from '$lib/server/whisper';
import { ndjson } from '$lib/server/ndjson';

/** Share of the bar the one-time model download gets when it has to happen. */
const DOWNLOAD_SHARE = 0.35;

/**
 * Second pass over an already-transcribed job: whisper's `-tr` mode against
 * the WAV the transcribe request left on disk, using the full multilingual
 * model (turbo can't translate). Streams the same NDJSON progress events.
 */
export const POST: RequestHandler = async ({ request, url }) => {
	const jobId = url.searchParams.get('job') ?? '';
	const job = getJob(jobId);
	if (!job) {
		return json(
			{
				message:
					'The audio for this transcript is no longer on the server. Transcribe the file again to translate it.'
			},
			{ status: 410 }
		);
	}

	return ndjson(async (emit, signal) => {
		const needsDownload = !modelReady('translate');
		const share = needsDownload ? DOWNLOAD_SHARE : 0;

		if (needsDownload) {
			emit({ type: 'progress', phase: 'downloading', progress: 0 });
			await awaitModel('translate', {
				signal,
				onProgress: (state) =>
					emit({
						type: 'progress',
						phase: 'downloading',
						progress: state.total ? (state.received / state.total) * share : 0
					})
			});
		}

		emit({ type: 'progress', phase: 'translating', progress: share });
		const result = await transcribe({
			wavPath: job.wavPath,
			language: job.language,
			translate: true,
			signal,
			onProgress: (p) =>
				emit({ type: 'progress', phase: 'translating', progress: share + p * (1 - share) })
		});
		emit({ type: 'done', ...result });
	}, request.signal);
};
