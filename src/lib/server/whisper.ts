import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Segment, Word } from '$lib/types';
import { modelPath } from './model';
import { findBin, ProcError, run } from './proc';

const WHISPER = process.env.WHISPER_CLI ?? findBin('whisper-cli');

type WhisperToken = {
	text: string;
	offsets: { from: number; to: number };
};

type WhisperJson = {
	result: { language: string };
	transcription: {
		offsets: { from: number; to: number };
		text: string;
		tokens?: WhisperToken[];
	}[];
};

/** `[_BEG_]`, `[_TT_519]`, … — control tokens, not spoken text. */
const SPECIAL_TOKEN = /^\[_.*\]$/;

/**
 * Fold whisper's sub-word tokens into whole words. A token that starts with a
 * space opens a new word; everything else (word pieces, punctuation, the
 * apostrophe in "m'appelle") joins the one in progress.
 */
function tokensToWords(tokens: WhisperToken[] = [], segmentEnd = 0): Word[] {
	const words: Word[] = [];
	for (const token of tokens) {
		if (SPECIAL_TOKEN.test(token.text.trim())) continue;
		const text = token.text;
		if (!text.trim()) continue;
		if (text.startsWith(' ') || words.length === 0) {
			words.push({ from: token.offsets.from, to: token.offsets.to, text: text.trim() });
		} else {
			const last = words[words.length - 1];
			last.text += text;
			last.to = token.offsets.to;
		}
	}

	// Whisper hands back zero-length spans for some words ("lis" at 8.6s→8.6s).
	// Stretch those to meet the next word instead of dropping them — these
	// words are real text, and a dropped one would vanish from the transcript.
	for (let i = 0; i < words.length; i++) {
		if (words[i].to > words[i].from) continue;
		const next = i + 1 < words.length ? words[i + 1].from : segmentEnd;
		words[i].to = Math.max(words[i].from, next);
	}

	return words;
}

/**
 * Run whisper.cpp over a prepared WAV. Progress comes from `-pp`, which prints
 * `whisper_print_progress_callback: progress = NN%` to stderr every 5%.
 */
export async function transcribe(opts: {
	wavPath: string;
	language: string;
	translate: boolean;
	onProgress?: (p: number) => void;
	signal?: AbortSignal;
}): Promise<{ language: string; segments: Segment[] }> {
	const outPrefix = path.join(
		path.dirname(opts.wavPath),
		opts.translate ? 'translation' : 'transcript'
	);
	const args = [
		'-m', modelPath(opts.translate ? 'translate' : 'transcribe'),
		'-f', opts.wavPath,
		'-l', opts.language,
		'-t', String(Math.max(4, os.cpus().length - 2)),
		'-oj',
		// full JSON adds per-token offsets, which drive word-level highlighting
		'-ojf',
		'-of', outPrefix,
		'-np',
		'-pp'
	];
	if (opts.translate) args.push('-tr');

	try {
		await run(WHISPER, args, {
			timeoutMs: 6 * 60 * 60_000,
			signal: opts.signal,
			onStderr: (line) => {
				const match = /progress\s*=\s*(\d+)%/.exec(line);
				if (match && opts.onProgress) opts.onProgress(Math.min(1, Number(match[1]) / 100));
			}
		});
	} catch (e) {
		if (e instanceof ProcError && e.message !== 'Cancelled') {
			throw new Error(`Transcription failed. ${e.detail.split('\n').at(-1) ?? ''}`.trim());
		}
		throw e;
	}

	const data: WhisperJson = JSON.parse(await fs.readFile(`${outPrefix}.json`, 'utf-8'));
	const segments: Segment[] = data.transcription
		.map((s) => {
			const words = tokensToWords(s.tokens, s.offsets.to);
			return {
				from: s.offsets.from,
				to: s.offsets.to,
				text: s.text.trim(),
				...(words.length ? { words } : {})
			};
		})
		.filter((s) => s.text.length > 0);

	return { language: opts.translate ? 'en' : data.result.language, segments };
}
