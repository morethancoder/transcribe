/**
 * The one place that knows whether transcrape is talking to a server or to Rust.
 *
 * There are two backends behind identical screens. The **server** build reaches
 * a Node process over `fetch`, and a run is a long POST streaming NDJSON. The
 * **app** build (Tauri, on desktop and mobile) has no server at all: the engine
 * is Rust in the same process, reached over IPC, and a run pushes events down a
 * `Channel`.
 *
 * Both are normalised to the same thing here — an async iterable of
 * `ProgressEvent` — so `JobRun` and the screens above it never learn which one
 * they got.
 */

import { readNdjson } from './ndjson';
import type { ModelId } from './models';
import type { ProgressEvent } from './types';

/**
 * Tauri injects this before any app code runs. Checked rather than imported so
 * the server build never pulls `@tauri-apps/api` into its bundle — every Tauri
 * import below is dynamic and only reached when this is true.
 */
export function isApp(): boolean {
	return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export type LogLevel = 'info' | 'warn' | 'error';

export type LogEntry = {
	atMs: number;
	level: LogLevel;
	source: string;
	message: string;
};

/** The engine's log, newest last. App build only — the web build's engine
 *  logs to the server terminal, and this returns an empty list there. */
export async function engineLogs(): Promise<LogEntry[]> {
	if (!isApp()) return [];
	const { invoke } = await import('@tauri-apps/api/core');
	return invoke<LogEntry[]>('logs_recent');
}

export async function clearEngineLogs(): Promise<void> {
	if (!isApp()) return;
	const { invoke } = await import('@tauri-apps/api/core');
	await invoke('logs_clear');
}

export type ModelStatus = {
	status: 'missing' | 'downloading' | 'ready' | 'error';
	received: number;
	total: number;
	message?: string;
	selected?: ModelId;
	resolved?: ModelId;
	available?: ModelId[];
};

/** A run in flight: its events, and the handle that stops it. */
export type Run = {
	events: AsyncIterable<ProgressEvent>;
	cancel: () => void;
};

/**
 * Push events, pull them as an async iterable.
 *
 * Tauri hands progress to a callback while consumers here want a `for await`.
 * Buffering both directions means neither side has to wait for the other: a
 * burst of events queues up, and a consumer that gets ahead parks until the
 * next one lands.
 */
class EventQueue implements AsyncIterable<ProgressEvent> {
	#queued: ProgressEvent[] = [];
	#waiting: ((r: IteratorResult<ProgressEvent>) => void)[] = [];
	#closed = false;

	push(event: ProgressEvent): void {
		if (this.#closed) return;
		const waiter = this.#waiting.shift();
		if (waiter) waiter({ value: event, done: false });
		else this.#queued.push(event);
	}

	close(): void {
		if (this.#closed) return;
		this.#closed = true;
		// Release anyone parked; queued events are still drained first.
		for (const waiter of this.#waiting.splice(0)) {
			waiter({ value: undefined, done: true });
		}
	}

	async *[Symbol.asyncIterator](): AsyncGenerator<ProgressEvent> {
		for (;;) {
			if (this.#queued.length) {
				yield this.#queued.shift()!;
				continue;
			}
			if (this.#closed) return;
			const next = await new Promise<IteratorResult<ProgressEvent>>((resolve) =>
				this.#waiting.push(resolve)
			);
			if (next.done) return;
			yield next.value;
		}
	}
}

// --- model -----------------------------------------------------------------

/**
 * True while the app build has an `ensure_model` invoke in flight, so the
 * polling that lands every 1.5 s doesn't stack a second one on top. Rust
 * serialises downloads per model anyway; this just keeps the IPC quiet.
 */
let ensuring = false;

/** Start the download in Rust and let it run; polling reports its progress. */
async function ensureAppModel(kind: 'transcribe' | 'translate'): Promise<void> {
	if (ensuring) return;
	ensuring = true;
	try {
		const { invoke, Channel } = await import('@tauri-apps/api/core');
		// Progress reaches the UI through `model_state` polling — the channel is
		// only here because the command signature demands one.
		await invoke('ensure_model', { kind, onEvent: new Channel<ProgressEvent>() });
	} catch {
		// the failure is recorded in Rust and surfaces on the next status poll
	} finally {
		ensuring = false;
	}
}

export async function modelStatus(kind: 'transcribe' | 'translate' = 'transcribe'): Promise<ModelStatus> {
	if (isApp()) {
		const { invoke } = await import('@tauri-apps/api/core');
		const [state, selection] = await Promise.all([
			invoke<ModelStatus>('model_state', { kind }),
			invoke<{ selected: ModelId; resolved: ModelId; available: ModelId[] }>('model_selection', {
				kind
			})
		]);
		const status = { ...state, ...selection };
		// Same contract as the web build's GET /api/model: asking about the
		// transcription model starts (or retries) its download when it's absent.
		if (kind === 'transcribe' && (status.status === 'missing' || status.status === 'error')) {
			void ensureAppModel(kind);
			return { ...status, status: 'downloading' };
		}
		return status;
	}
	const res = await fetch(`/api/model${kind === 'translate' ? '?kind=translate' : ''}`);
	return res.json();
}

export async function selectModel(model: ModelId): Promise<ModelStatus> {
	if (isApp()) {
		const { invoke } = await import('@tauri-apps/api/core');
		await invoke('select_model', { model });
		return modelStatus('transcribe');
	}
	const res = await fetch('/api/model', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ model })
	});
	if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Could not switch model');
	return res.json();
}

// --- picking a file --------------------------------------------------------

/**
 * What a run needs to find the media.
 *
 * The two backends genuinely differ here and it can't be papered over: the
 * server takes the bytes as a request body, while Rust takes a path and opens
 * the file itself. A path is why the app build uses a native dialog instead of
 * `<input type="file">` — the webview's File object carries no path, so the
 * alternative would be pushing a whole video through IPC.
 */
export type Source = { kind: 'file'; file: File } | { kind: 'path'; path: string; name: string };

/** Open the platform's picker. Only used by the app build. */
export async function pickFile(): Promise<Source | null> {
	const { open } = await import('@tauri-apps/plugin-dialog');
	const picked = await open({
		multiple: false,
		directory: false,
		filters: [
			{
				name: 'Audio and video',
				extensions: ['mp3', 'm4a', 'aac', 'wav', 'flac', 'mp4', 'mov', 'mkv', 'webm', 'ogg', 'opus', 'aiff', 'caf', '3gp']
			}
		]
	});
	if (typeof picked !== 'string') return null;
	const name = picked.split(/[/\\]/).pop() ?? picked;
	return { kind: 'path', path: picked, name };
}

/**
 * A URL the webview can load for a picked path, for the poster frame and
 * playback. Rust admits the one file into the asset protocol's scope first —
 * the scope starts empty, so nothing is reachable that wasn't picked.
 *
 * Null when the platform can't serve it (Android's `content://` URIs, for
 * one); a preview is decoration, and the transcription path doesn't need it.
 */
export async function mediaUrl(path: string): Promise<string | null> {
	if (!isApp()) return null;
	try {
		const { invoke, convertFileSrc } = await import('@tauri-apps/api/core');
		await invoke('allow_media', { path });
		return convertFileSrc(path);
	} catch {
		return null;
	}
}

// --- runs ------------------------------------------------------------------

export function transcribe(opts: {
	runId: string;
	source: Source;
	language: string;
}): Run {
	if (isApp()) {
		if (opts.source.kind !== 'path') {
			throw new Error('The app build transcribes from a path, not an uploaded file.');
		}
		return invokeRun('transcribe', {
			runId: opts.runId,
			path: opts.source.path,
			language: opts.language
		});
	}
	if (opts.source.kind !== 'file') {
		throw new Error('The server build transcribes an uploaded file, not a path.');
	}
	const params = new URLSearchParams({ language: opts.language, name: opts.source.file.name });
	return fetchRun(`/api/transcribe?${params}`, {
		method: 'POST',
		headers: { 'content-type': 'application/octet-stream' },
		body: opts.source.file
	});
}

export function translate(opts: { runId: string; jobId: string }): Run {
	if (isApp()) {
		return invokeRun('translate', { runId: opts.runId, jobId: opts.jobId });
	}
	return fetchRun(`/api/translate?job=${encodeURIComponent(opts.jobId)}`, { method: 'POST' });
}

/** A run over HTTP: one streaming response, aborted by its controller. */
function fetchRun(url: string, init: RequestInit): Run {
	const controller = new AbortController();
	const queue = new EventQueue();

	(async () => {
		try {
			const res = await fetch(url, { ...init, signal: controller.signal });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message ?? `Request failed (${res.status})`);
			}
			for await (const event of readNdjson<ProgressEvent>(res)) queue.push(event);
		} catch (e) {
			// An abort is the user cancelling; the caller already knows.
			if (!(e instanceof DOMException && e.name === 'AbortError')) {
				queue.push({ type: 'error', message: e instanceof Error ? e.message : String(e) });
			}
		} finally {
			queue.close();
		}
	})();

	return { events: queue, cancel: () => controller.abort() };
}

/** A run over IPC: events arrive on a Channel, cancelled by a second command. */
function invokeRun(command: string, args: Record<string, unknown>): Run {
	const queue = new EventQueue();
	const runId = String(args.runId);

	(async () => {
		try {
			const { invoke, Channel } = await import('@tauri-apps/api/core');
			const channel = new Channel<ProgressEvent>();
			channel.onmessage = (event) => queue.push(event);
			// Resolves when the run ends; the events have already been pushed.
			await invoke(command, { ...args, onEvent: channel });
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			// Rust reports a cancel as an error too, but the engine has already
			// sent nothing for it — and a cancel isn't worth surfacing.
			if (message !== 'Cancelled') queue.push({ type: 'error', message });
		} finally {
			queue.close();
		}
	})();

	return {
		events: queue,
		cancel: () => {
			void (async () => {
				const { invoke } = await import('@tauri-apps/api/core');
				await invoke('cancel_run', { runId }).catch(() => {});
			})();
		}
	};
}

// --- cached audio ----------------------------------------------------------

/**
 * A playable URL for a finished job's decoded audio, or null once it's expired.
 *
 * The server can be asked with a HEAD and then handed straight to an `<audio>`
 * element. Rust returns the bytes, which become a blob URL — so the caller has
 * to release it, which `revokeAudio` does.
 */
export async function jobAudio(jobId: string): Promise<string | null> {
	if (isApp()) {
		const { invoke } = await import('@tauri-apps/api/core');
		try {
			const ready = await invoke<boolean>('job_audio_ready', { jobId });
			if (!ready) return null;
			const bytes = await invoke<number[]>('job_audio', { jobId });
			return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }));
		} catch {
			return null;
		}
	}
	const url = `/api/audio?job=${encodeURIComponent(jobId)}`;
	try {
		const res = await fetch(url, { method: 'HEAD' });
		return res.ok ? url : null;
	} catch {
		return null;
	}
}

/** Undo `jobAudio` when it handed back a blob. Harmless on a plain URL. */
export function revokeAudio(url: string | null): void {
	if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}
