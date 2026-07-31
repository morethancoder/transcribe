import { readNdjson } from './ndjson';
import { fmtEta } from './format';
import type { Phase, ProgressEvent, Segment } from './types';

const PHASE_LABEL: Record<Phase, string> = {
	preparing: 'Preparing audio',
	transcribing: 'Transcribing',
	downloading: 'Downloading translation model',
	translating: 'Translating to English'
};

export type JobResult = { language: string; segments: Segment[] };

/**
 * Drives one streaming /api call and exposes what the progress bar needs.
 * Shared by the transcribe run on the home page and the translate run inside
 * a transcript.
 */
export class JobRun {
	phase = $state<Phase | null>(null);
	/** Whole-run completion, 0..1 — the server weights the phases. */
	progress = $state(0);
	elapsedMs = $state(0);
	error = $state('');
	jobId = $state('');
	/** Media length, from the server for transcribe or the caller for translate. */
	durationMs = $state(0);

	/** Rate is measured from the current phase only: phases run at very
	 *  different speeds, so carrying the previous one's rate across the
	 *  boundary would swing the estimate right when it's most visible. */
	#anchor = $state({ at: 0, progress: 0 });
	#speed = 10;
	#controller: AbortController | null = null;
	#timer: ReturnType<typeof setInterval> | undefined;

	running = $derived(this.phase !== null);

	label = $derived(this.phase ? PHASE_LABEL[this.phase] : '');

	/** Milliseconds left, or null while there's nothing to base a guess on. */
	remainingMs = $derived.by(() => {
		if (!this.running) return null;
		const moved = this.progress - this.#anchor.progress;
		const since = this.elapsedMs - this.#anchor.at;
		if (moved > 0.01 && since > 0) return ((1 - this.progress) * since) / moved;
		// nothing measured yet — fall back to how fast this machine has been
		if (this.durationMs > 0) return Math.max(0, this.durationMs / this.#speed - this.elapsedMs);
		return null;
	});

	detail = $derived(this.remainingMs === null ? 'Estimating time…' : fmtEta(this.remainingMs));

	async run(
		url: string,
		init: RequestInit,
		opts: { durationMs?: number; speed?: number } = {}
	): Promise<JobResult | null> {
		this.#controller = new AbortController();
		this.error = '';
		this.jobId = '';
		this.phase = 'preparing';
		this.progress = 0;
		this.durationMs = opts.durationMs ?? 0;
		this.#speed = opts.speed ?? 10;
		this.elapsedMs = 0;
		this.#anchor = { at: 0, progress: 0 };

		const started = Date.now();
		this.#timer = setInterval(() => (this.elapsedMs = Date.now() - started), 250);

		try {
			const res = await fetch(url, { ...init, signal: this.#controller.signal });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message ?? `Request failed (${res.status})`);
			}

			let result: JobResult | null = null;
			for await (const event of readNdjson<ProgressEvent>(res)) {
				if (event.type === 'meta') {
					this.jobId = event.jobId;
					if (event.durationMs) this.durationMs = event.durationMs;
				} else if (event.type === 'progress') {
					if (event.phase !== this.phase) {
						this.phase = event.phase;
						this.#anchor = { at: Date.now() - started, progress: event.progress };
					}
					this.progress = event.progress;
				} else if (event.type === 'done') {
					result = { language: event.language, segments: event.segments };
				} else {
					throw new Error(event.message);
				}
			}
			if (!result) throw new Error('The run stopped before it finished.');
			return result;
		} catch (e) {
			// a cancel is a user action, not an error to report back at them
			if (!(e instanceof DOMException && e.name === 'AbortError')) {
				this.error = e instanceof Error ? e.message : String(e);
			}
			return null;
		} finally {
			clearInterval(this.#timer);
			this.phase = null;
			this.#controller = null;
		}
	}

	cancel(): void {
		this.#controller?.abort();
	}
}
