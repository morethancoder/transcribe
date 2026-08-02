import { fmtEta } from './format';
import { m } from './i18n.svelte';
import type { Run } from './transport';
import type { Phase, Segment } from './types';

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
	#active: Run | null = null;
	#cancelled = false;
	#timer: ReturnType<typeof setInterval> | undefined;

	running = $derived(this.phase !== null);

	label = $derived(this.phase ? m().run[this.phase] : '');

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

	detail = $derived(this.remainingMs === null ? m().run.estimating : fmtEta(this.remainingMs));

	/**
	 * Drive one run to completion.
	 *
	 * Takes a `Run` rather than a URL because the two backends reach the engine
	 * differently — a streaming POST on the server, an IPC channel in the app.
	 * `$lib/transport` builds either one; this only consumes the events.
	 */
	async run(
		active: Run,
		opts: { durationMs?: number; speed?: number } = {}
	): Promise<JobResult | null> {
		this.#active = active;
		this.#cancelled = false;
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
			let result: JobResult | null = null;
			for await (const event of active.events) {
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
			// The stream ending without a result means the engine stopped early —
			// unless we were the ones who stopped it, which isn't an error.
			if (!result && !this.#cancelled) {
				throw new Error(m().run.stoppedEarly);
			}
			return result;
		} catch (e) {
			if (!this.#cancelled) this.error = e instanceof Error ? e.message : String(e);
			return null;
		} finally {
			clearInterval(this.#timer);
			this.phase = null;
			this.#active = null;
			this.#cancelled = false;
		}
	}

	cancel(): void {
		// Recorded as well as forwarded: both backends simply stop sending, so
		// without this the silence that follows looks like a failed run.
		this.#cancelled = true;
		this.#active?.cancel();
	}
}
