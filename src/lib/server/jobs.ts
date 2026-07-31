import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * A finished transcription keeps its decoded WAV on disk so "Translate to
 * English" can re-run whisper without a second upload. Entries expire so a
 * long-running dev server doesn't fill /tmp with audio.
 */
export type Job = {
	id: string;
	dir: string;
	wavPath: string;
	/** Detected (or chosen) spoken language — the translate pass reuses it. */
	language: string;
	createdAt: number;
};

const TTL_MS = Number(process.env.JOB_TTL_MS ?? 6 * 60 * 60_000);
const MAX_JOBS = Number(process.env.MAX_JOBS ?? 20);

const jobs = new Map<string, Job>();

export async function createWorkDir(): Promise<{ id: string; dir: string }> {
	await sweep();
	const id = randomUUID();
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'transcrape-'));
	return { id, dir };
}

export async function keepJob(job: Job): Promise<void> {
	jobs.set(job.id, job);
	await sweep();
}

export function getJob(id: string): Job | undefined {
	const job = jobs.get(id);
	if (job && Date.now() - job.createdAt > TTL_MS) {
		void discard(id);
		return undefined;
	}
	return job;
}

export async function discard(id: string): Promise<void> {
	const job = jobs.get(id);
	jobs.delete(id);
	if (job) await fs.rm(job.dir, { recursive: true, force: true });
}

/**
 * Work dirs from a previous process are unreachable — the registry lives in
 * memory — so a restart would leak them. Age-gated so a second dev server
 * running side by side doesn't lose the job it just created.
 */
export async function reapOrphans(): Promise<void> {
	const tmp = os.tmpdir();
	const stale = Date.now() - 10 * 60_000;
	let names: string[];
	try {
		names = await fs.readdir(tmp);
	} catch {
		return;
	}
	await Promise.all(
		names
			.filter((name) => name.startsWith('transcrape-'))
			.map(async (name) => {
				const dir = path.join(tmp, name);
				try {
					if ((await fs.stat(dir)).mtimeMs < stale) {
						await fs.rm(dir, { recursive: true, force: true });
					}
				} catch {
					// raced with another sweep, or not ours to delete
				}
			})
	);
}

/** Drop expired jobs, then the oldest ones over the cap. */
async function sweep(): Promise<void> {
	const now = Date.now();
	const live = [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt);
	const expired = live.filter((j) => now - j.createdAt > TTL_MS);
	const fresh = live.filter((j) => now - j.createdAt <= TTL_MS);
	const overflow = fresh.slice(0, Math.max(0, fresh.length - MAX_JOBS));
	await Promise.all([...expired, ...overflow].map((j) => discard(j.id)));
}
