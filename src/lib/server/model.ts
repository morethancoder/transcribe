import { createWriteStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
	DEFAULT_MODEL,
	MODELS,
	getModel,
	isModelId,
	translateModelFor,
	type ModelId
} from '$lib/models';

/**
 * Two *roles*, not two fixed models. Transcription runs whichever model the
 * user picked; "Translate to English" runs that same model when it can
 * translate, and falls back to a multilingual one when it can't — which today
 * means only when they picked `large-v3-turbo`, since turbo silently ignores
 * whisper's `-tr` flag and returns the source language.
 *
 * The catalogue itself lives in `$lib/models`, shared with the picker in the UI.
 */
export type ModelKind = 'transcribe' | 'translate';

export const MODEL_KINDS: ModelKind[] = ['transcribe', 'translate'];

const HF = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

const MODEL_DIR = process.env.WHISPER_MODEL_DIR ?? path.resolve('models');
/** Remembers the choice across restarts. A plain file so it can be deleted. */
const SELECTION_FILE = path.join(MODEL_DIR, 'selected.json');

let selected: ModelId = loadSelection();

function loadSelection(): ModelId {
	// An explicit env var still wins, so an existing deployment that pinned a
	// model file keeps the model it pinned.
	const pinned = process.env.WHISPER_MODEL_ID;
	if (isModelId(pinned)) return pinned;
	try {
		const raw: unknown = JSON.parse(readFileSync(SELECTION_FILE, 'utf-8'));
		const id = (raw as { model?: unknown })?.model;
		if (isModelId(id)) return id;
	} catch {
		// no choice made yet, or the file is unreadable — the default is fine
	}
	return DEFAULT_MODEL;
}

/** Which model is currently doing the transcribing. */
export function selectedModel(): ModelId {
	return selected;
}

/** Change it. Downloads are lazy, so this is only a note of intent. */
export function selectModel(id: ModelId): void {
	selected = id;
	try {
		writeFileSync(SELECTION_FILE, JSON.stringify({ model: id }, null, '\t'));
	} catch {
		// read-only install — the choice just won't survive a restart
	}
}

/** The model id backing a role, given the current selection. */
export function modelIdFor(kind: ModelKind): ModelId {
	return kind === 'transcribe' ? selected : translateModelFor(selected);
}

/** Which models are already on disk — switching to one of these is instant. */
export function downloadedModels(): ModelId[] {
	return MODELS.filter((m) => existsSync(path.join(MODEL_DIR, m.file))).map((m) => m.id);
}

function fileFor(kind: ModelKind): { path: string; url: string } {
	const model = getModel(modelIdFor(kind));
	return { path: path.join(MODEL_DIR, model.file), url: `${HF}/${model.file}` };
}

export type ModelState = {
	status: 'missing' | 'downloading' | 'ready' | 'error';
	received: number;
	total: number;
	message?: string;
};

/**
 * Keyed by model, not by role. Two roles can resolve to the same file, and
 * switching models while one is downloading shouldn't strand that progress
 * under a role that has stopped pointing at it.
 */
const states = new Map<ModelId, ModelState>();
const downloading = new Set<ModelId>();

function stateOf(id: ModelId): ModelState {
	return states.get(id) ?? { status: 'missing', received: 0, total: 0 };
}

export function modelPath(kind: ModelKind): string {
	return fileFor(kind).path;
}

export function modelReady(kind: ModelKind): boolean {
	return existsSync(fileFor(kind).path);
}

export function modelState(kind: ModelKind): ModelState {
	const { path: file } = fileFor(kind);
	if (existsSync(file)) {
		const size = statSync(file).size;
		return { status: 'ready', received: size, total: size };
	}
	return stateOf(modelIdFor(kind));
}

/** Kick off a model download if it isn't on disk yet. Safe to call repeatedly. */
export function ensureModel(kind: ModelKind): void {
	const id = modelIdFor(kind);
	if (downloading.has(id) || modelReady(kind)) return;
	downloading.add(id);
	states.set(id, { status: 'downloading', received: 0, total: 0 });
	download(kind, id)
		.catch((e) => {
			states.set(id, {
				status: 'error',
				received: 0,
				total: stateOf(id).total,
				message: e instanceof Error ? e.message : String(e)
			});
		})
		.finally(() => downloading.delete(id));
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

async function download(kind: ModelKind, id: ModelId): Promise<void> {
	const { path: dest, url } = fileFor(kind);
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
	const progress: ModelState = { status: 'downloading', received: offset, total };
	states.set(id, progress);

	const out = createWriteStream(partial, { flags: res.status === 206 ? 'a' : 'w' });
	try {
		for await (const chunk of res.body) {
			if (!out.write(chunk)) await once(out, 'drain');
			progress.received += chunk.length;
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
	states.set(id, { status: 'ready', received: progress.received, total });
}
