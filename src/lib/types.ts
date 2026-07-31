export type Word = { from: number; to: number; text: string };

export type Segment = {
	from: number;
	to: number;
	text: string;
	/** Per-word timings, when whisper gave usable token offsets. Absent on
	 *  edited lines, whose text no longer matches the original timings. */
	words?: Word[];
};

/** Steps a run passes through; each one labels the shared progress bar. */
export type Phase = 'preparing' | 'transcribing' | 'downloading' | 'translating';

export type ProgressEvent =
	| { type: 'meta'; jobId: string; durationMs: number }
	/** `progress` is the whole run's 0..1 completion — the server owns the
	 *  weighting between phases, since only it knows which ones will run. */
	| { type: 'progress'; phase: Phase; progress: number }
	| { type: 'done'; language: string; segments: Segment[] }
	| { type: 'error'; message: string };
