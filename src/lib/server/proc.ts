import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Package-manager install prefixes that a GUI- or service-launched process
 * doesn't necessarily inherit on its PATH (Homebrew on macOS, Snap and
 * ~/.local on Linux). Windows installers — winget, Chocolatey, Scoop — all put
 * their shims on the PATH, so there's nothing to probe there and we fall
 * straight through to letting spawn resolve the name.
 */
const EXTRA_BIN_DIRS: Record<string, string[]> = {
	darwin: ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'],
	linux: [
		'/usr/local/bin',
		'/usr/bin',
		'/bin',
		'/snap/bin',
		path.join(os.homedir(), '.local', 'bin')
	],
	win32: []
};

/**
 * Resolve a helper binary to an absolute path when we can, otherwise hand back
 * the bare name so spawn falls back to the PATH.
 */
export function findBin(name: string): string {
	const exe = process.platform === 'win32' ? `${name}.exe` : name;
	for (const dir of EXTRA_BIN_DIRS[process.platform] ?? []) {
		const p = path.join(dir, exe);
		if (existsSync(p)) return p;
	}
	return exe;
}

export class ProcError extends Error {
	constructor(
		message: string,
		readonly detail: string
	) {
		super(message);
	}
}

type RunOptions = {
	/** Called for every complete line the child writes to stdout. */
	onStdout?: (line: string) => void;
	/** Called for every complete line the child writes to stderr. */
	onStderr?: (line: string) => void;
	/** Aborting kills the child — used when the browser drops the request. */
	signal?: AbortSignal;
	timeoutMs?: number;
};

/**
 * Spawn a child and resolve when it exits 0. Output is delivered line by line
 * as it arrives (whisper and ffmpeg both report progress on a live stream), so
 * this is used instead of execFile even where the output isn't needed.
 */
export function run(bin: string, args: string[], opts: RunOptions = {}): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
		const tail: string[] = [];
		let settled = false;

		const finish = (err?: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			opts.signal?.removeEventListener('abort', onAbort);
			if (err) reject(err);
			else resolve();
		};

		const onAbort = () => {
			child.kill('SIGKILL');
			finish(new ProcError('Cancelled', ''));
		};

		const timer = opts.timeoutMs
			? setTimeout(() => {
					child.kill('SIGKILL');
					finish(new ProcError(`${path.basename(bin)} timed out`, ''));
				}, opts.timeoutMs)
			: undefined;

		if (opts.signal?.aborted) return onAbort();
		opts.signal?.addEventListener('abort', onAbort);

		const lines = (stream: NodeJS.ReadableStream, onLine?: (line: string) => void) => {
			let buf = '';
			stream.setEncoding('utf-8');
			stream.on('data', (chunk: string) => {
				// ffmpeg ends progress blocks with \r, whisper with \n
				buf += chunk;
				const parts = buf.split(/\r\n|[\r\n]/);
				buf = parts.pop() ?? '';
				for (const line of parts) {
					if (onLine) onLine(line);
					if (stream === child.stderr && line.trim()) {
						tail.push(line.trim());
						if (tail.length > 40) tail.shift();
					}
				}
			});
		};
		lines(child.stdout, opts.onStdout);
		lines(child.stderr, opts.onStderr);

		child.on('error', (e) =>
			finish(new ProcError(`Could not run ${path.basename(bin)}`, e.message))
		);
		child.on('close', (code) => {
			if (code === 0) finish();
			else finish(new ProcError(`${path.basename(bin)} exited with code ${code}`, tail.join('\n')));
		});
	});
}

/** Same as run(), but resolves with everything the child wrote to stdout. */
export async function capture(bin: string, args: string[], opts: RunOptions = {}): Promise<string> {
	const out: string[] = [];
	await run(bin, args, { ...opts, onStdout: (line) => out.push(line) });
	return out.join('\n');
}
