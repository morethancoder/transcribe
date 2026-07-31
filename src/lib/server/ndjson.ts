import type { ProgressEvent } from '$lib/types';

/**
 * Newline-delimited JSON response. Progress has to reach the browser while the
 * work is still running, so these endpoints stream events instead of resolving
 * to one JSON body; failures after the first byte arrive as an `error` event
 * (the status line is long gone by then).
 *
 * The abort signal passed to `produce` fires when the browser goes away — via
 * the stream's own `cancel()`, since `request.signal` stays open on a dropped
 * connection. Long whisper runs would otherwise keep burning CPU for a tab
 * that closed.
 */
export function ndjson(
	produce: (emit: (event: ProgressEvent) => void, signal: AbortSignal) => Promise<void>,
	requestSignal: AbortSignal
): Response {
	const encoder = new TextEncoder();
	const aborter = new AbortController();
	const abort = () => aborter.abort();
	requestSignal.addEventListener('abort', abort);

	const stream = new ReadableStream({
		async start(controller) {
			let open = true;
			const emit = (event: ProgressEvent) => {
				if (!open) return;
				try {
					controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
				} catch {
					open = false;
					abort();
				}
			};
			try {
				await produce(emit, aborter.signal);
			} catch (e) {
				if (!aborter.signal.aborted) {
					emit({ type: 'error', message: e instanceof Error ? e.message : String(e) });
				}
			} finally {
				open = false;
				requestSignal.removeEventListener('abort', abort);
				try {
					controller.close();
				} catch {
					// already closed by the client disconnecting
				}
			}
		},
		cancel() {
			abort();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'application/x-ndjson; charset=utf-8',
			'cache-control': 'no-store',
			'x-accel-buffering': 'no'
		}
	});
}
