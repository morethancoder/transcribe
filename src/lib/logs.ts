/**
 * Frontend log capture, feeding the same log the Rust engine writes.
 *
 * In the app build every entry is forwarded over IPC into the engine's ring
 * buffer, so the Developer screen tells one story — a JS error that broke a
 * run sits next to the engine lines from that run. In the web build there is
 * no Rust to forward to; entries stay in a local array and the logs screen
 * shows those (the engine's own logging goes to the server terminal there).
 */

import { isApp, type LogEntry, type LogLevel } from './transport';

const KEEP = 300;
const local: LogEntry[] = [];

export function record(level: LogLevel, source: string, message: string): void {
	local.push({ atMs: Date.now(), level, source, message });
	if (local.length > KEEP) local.shift();
	if (isApp()) {
		void import('@tauri-apps/api/core')
			.then(({ invoke }) => invoke('log_event', { level, source, message }))
			.catch(() => {});
	}
}

/** What this webview captured itself — the web build's whole log. */
export function frontendLogs(): LogEntry[] {
	return [...local];
}

export function clearFrontendLogs(): void {
	local.length = 0;
}

let installed = false;

/**
 * Hook the places errors escape to: uncaught exceptions, unhandled
 * rejections, and `console.error`/`console.warn`. Console stays functional —
 * entries are copied, not diverted.
 */
export function installLogCapture(): void {
	if (installed || typeof window === 'undefined') return;
	installed = true;

	window.addEventListener('error', (e) => {
		const where = e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : '';
		record('error', 'ui', `${e.message}${where}`);
	});
	window.addEventListener('unhandledrejection', (e) => {
		const reason = e.reason instanceof Error ? (e.reason.stack ?? e.reason.message) : String(e.reason);
		record('error', 'ui', `Unhandled rejection: ${reason}`);
	});

	for (const level of ['warn', 'error'] as const) {
		const original = console[level].bind(console);
		console[level] = (...args: unknown[]) => {
			record(
				level,
				'console',
				args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : String(a))).join(' ')
			);
			original(...args);
		};
	}
}
