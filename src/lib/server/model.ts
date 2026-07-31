import { createWriteStream, existsSync, statSync } from 'node:fs';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Two models, because `large-v3-turbo` is transcription-only — it silently
 * ignores whisper's `-tr` flag and returns the source language. Transcription
 * uses turbo (fast); "Translate to English" needs a full multilingual model,
 * downloaded the first time someone asks for a translation.
 */
export type ModelKind = 'transcribe' | 'translate';

export const MODEL_KINDS: ModelKind[] = ['transcribe', 'translate'];

const HF = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

const MODELS: Record<ModelKind, { path: string; url: string }> = {
	transcribe: {
		path: process.env.WHISPER_MODEL ?? path.resolve('models/ggml-large-v3-turbo-q5_0.bin'),
		url: process.env.WHISPER_MODEL_URL ?? `${HF}/ggml-large-v3-turbo-q5_0.bin`
	},
	translate: {
		path: process.env.WHISPER_TRANSLATE_MODEL ?? path.resolve('models/ggml-medium-q5_0.bin'),
		url: process.env.WHISPER_TRANSLATE_MODEL_URL ?? `${HF}/ggml-medium-q5_0.bin`
	}
};

export type ModelState = {
	status: 'missing' | 'downloading' | 'ready' | 'error';
	received: number;
	total: number;
	message?: string;
};

const states: Record<ModelKind, ModelState> = {
	transcribe: { status: 'missing', received: 0, total: 0 },
	translate: { status: 'missing', received: 0, total: 0 }
};
const downloading = new Set<ModelKind>();

export function modelPath(kind: ModelKind): string {
	return MODELS[kind].path;
}

export function modelReady(kind: ModelKind): boolean {
	return existsSync(MODELS[kind].path);
}

export function modelState(kind: ModelKind): ModelState {
	if (modelReady(kind)) {
		const size = statSync(MODELS[kind].path).size;
		return { status: 'ready', received: size, total: size };
	}
	return states[kind];
}

/** Kick off a model download if it isn't on disk yet. Safe to call repeatedly. */
export function ensureModel(kind: ModelKind): void {
	if (downloading.has(kind) || modelReady(kind)) return;
	downloading.add(kind);
	states[kind] = { status: 'downloading', received: 0, total: 0 };
	download(kind)
		.catch((e) => {
			states[kind] = {
				status: 'error',
				received: 0,
				total: states[kind].total,
				message: e instanceof Error ? e.message : String(e)
			};
		})
		.finally(() => downloading.delete(kind));
}

/** Start the download if needed and resolve once the file is on disk. */
export async function awaitModel(
	kind: ModelKind,
	opts: { onProgress?: (state: ModelState) => void; signal?: AbortSignal } = {}
): Promise<void> {
	ensureModel(kind);
	for (;;) {
		const state = modelState(kind);
		if (state.status === 'ready') return;
		if (state.status === 'error') throw new Error(state.message ?? 'Model download failed');
		if (opts.signal?.aborted) throw new Error('Cancelled');
		opts.onProgress?.(state);
		await new Promise((r) => setTimeout(r, 300));
	}
}

async function download(kind: ModelKind): Promise<void> {
	const { path: dest, url } = MODELS[kind];
	const partial = `${dest}.download`;
	await fs.mkdir(path.dirname(dest), { recursive: true });

	// Resume a previous partial download when the server supports ranges.
	let offset = existsSync(partial) ? statSync(partial).size : 0;
	const res = await fetch(url, {
		headers: offset > 0 ? { Range: `bytes=${offset}-` } : {},
		redirect: 'follow'
	});
	if (!res.ok && res.status !== 206) throw new Error(`Model download failed: HTTP ${res.status}`);
	if (!res.body) throw new Error('Model download failed: empty response');
	if (res.status !== 206) offset = 0;

	const total = offset + Number(res.headers.get('content-length') ?? 0);
	states[kind] = { status: 'downloading', received: offset, total };

	const out = createWriteStream(partial, { flags: res.status === 206 ? 'a' : 'w' });
	try {
		for await (const chunk of res.body) {
			if (!out.write(chunk)) await once(out, 'drain');
			states[kind].received += chunk.length;
		}
		await new Promise<void>((resolve, reject) => {
			out.end(() => resolve());
			out.on('error', reject);
		});
	} catch (e) {
		out.destroy();
		throw e;
	}

	await fs.rename(partial, dest);
	states[kind] = { status: 'ready', received: states[kind].received, total };
}
