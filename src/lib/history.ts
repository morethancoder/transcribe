import { browser } from '$app/environment';
import type { Segment } from './types';

export type HistoryEntry = {
	id: string;
	/** Server-side job holding the decoded audio; translation needs it alive. */
	jobId: string;
	name: string;
	size: number;
	createdAt: number;
	/** Whether the source was a video — decides the player element. Optional:
	 *  entries written before playback existed don't carry it. */
	kind?: 'video' | 'audio';
	/** Poster frame as a data URL, for videos the browser could decode. */
	thumbnail?: string | null;
	/** Length of the source media, 0 when the container didn't report one. */
	durationMs: number;
	/** Wall time the transcription pass took — feeds the next run's estimate. */
	tookMs: number;
	language: string;
	segments: Segment[];
	translation: Segment[] | null;
};

const KEY = 'transcrape-history-v1';
const MAX_ENTRIES = 50;
/** Audio seconds transcribed per wall second, before we've measured this machine. */
const DEFAULT_SPEED = 10;

export function loadHistory(): HistoryEntry[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
	} catch {
		return [];
	}
}

export function getEntry(id: string): HistoryEntry | undefined {
	return loadHistory().find((e) => e.id === id);
}

export function addEntry(entry: HistoryEntry): void {
	save([entry, ...loadHistory().filter((e) => e.id !== entry.id)]);
}

export function patchEntry(id: string, patch: Partial<HistoryEntry>): void {
	save(loadHistory().map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

export function removeEntry(id: string): void {
	save(loadHistory().filter((e) => e.id !== id));
}

export function clearHistory(): void {
	save([]);
}

/**
 * Audio seconds per wall second, averaged over recent runs on this machine —
 * used to show an ETA before whisper reports its first progress tick.
 */
export function estimateSpeed(): number {
	const samples = loadHistory()
		.filter((e) => e.durationMs > 0 && e.tookMs > 0)
		.slice(0, 5)
		.map((e) => e.durationMs / e.tookMs);
	if (!samples.length) return DEFAULT_SPEED;
	return samples.reduce((a, b) => a + b, 0) / samples.length;
}

/** Persist, trimming oldest entries until it fits the storage quota. */
function save(entries: HistoryEntry[]): void {
	if (!browser) return;
	let kept = entries.slice(0, MAX_ENTRIES);
	for (;;) {
		try {
			localStorage.setItem(KEY, JSON.stringify(kept));
			return;
		} catch {
			if (kept.length <= 1) {
				localStorage.removeItem(KEY);
				return;
			}
			kept = kept.slice(0, Math.ceil(kept.length / 2));
		}
	}
}
