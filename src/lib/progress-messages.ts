import type { Phase } from './types';
import { m } from './i18n.svelte';

/**
 * Something to read while a long run goes nowhere visible.
 *
 * Whisper reports progress every 5%, which on a long file is minutes apart, so
 * a bar that only moves on those ticks reads as hung. These rotate underneath
 * it to show the app is still alive.
 *
 * They describe what is actually happening rather than inventing suspense —
 * the point is reassurance, and a line that claims work nobody is doing stops
 * being reassuring the moment someone reads it twice.
 *
 * The lines themselves live in the i18n dictionaries; this indirection is what
 * keeps them following the app language mid-run.
 */
export function progressMessages(phase: Phase): string[] {
	return m().progress[phase];
}

/** How long each line stays up. Long enough to read, short enough to notice. */
export const MESSAGE_INTERVAL_MS = 4000;
