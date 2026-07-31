import { capture, findBin, ProcError, run } from './proc';

const FFMPEG = process.env.FFMPEG ?? findBin('ffmpeg');
const FFPROBE = process.env.FFPROBE ?? findBin('ffprobe');

/** Length of the media in milliseconds, or 0 when the container doesn't say. */
export async function probeDuration(input: string): Promise<number> {
	try {
		const out = await capture(
			FFPROBE,
			[
				'-v', 'error',
				'-show_entries', 'format=duration',
				'-of', 'default=noprint_wrappers=1:nokey=1',
				input
			],
			{ timeoutMs: 60_000 }
		);
		const seconds = Number.parseFloat(out.trim());
		return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
	} catch {
		return 0; // a missing duration only costs us the ETA, not the transcript
	}
}

/**
 * Decode any container down to the 16 kHz mono WAV whisper.cpp wants,
 * reporting 0..1 progress against `durationMs` (skipped when it's unknown).
 */
export async function toWav(
	input: string,
	output: string,
	opts: { durationMs: number; onProgress?: (p: number) => void; signal?: AbortSignal }
): Promise<void> {
	try {
		await run(
			FFMPEG,
			[
				'-y',
				'-i', input,
				'-vn',
				'-ac', '1',
				'-ar', '16000',
				'-nostats',
				'-progress', 'pipe:1',
				output
			],
			{
				timeoutMs: 30 * 60_000,
				signal: opts.signal,
				onStdout: (line) => {
					// -progress emits `key=value` blocks; out_time_us is the decoded position
					const [key, value] = line.split('=');
					if (key !== 'out_time_us' || !opts.durationMs || !opts.onProgress) return;
					const done = Number(value) / 1000 / opts.durationMs;
					if (Number.isFinite(done)) opts.onProgress(Math.min(1, Math.max(0, done)));
				}
			}
		);
	} catch (e) {
		if (e instanceof ProcError && e.message !== 'Cancelled') {
			const detail = e.detail.split('\n').at(-1) ?? '';
			throw new Error(`Could not extract audio from this file. ${detail}`.trim());
		}
		throw e;
	}
}
