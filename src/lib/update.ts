/**
 * "Is there a newer release?" — asked of GitHub, once per session.
 *
 * Deliberately not an auto-updater: every platform this ships on has its own
 * idea of how apps update (notarised DMGs, signed APKs, app stores), and a
 * wrong guess bricks someone's install. Detecting the release and pointing at
 * its page is the part that is safe everywhere, so that is all this does.
 */

import { browser } from '$app/environment';
import pkg from '../../package.json';

export type UpdateInfo = { version: string; url: string };

const RELEASES_API = 'https://api.github.com/repos/morethancoder/transcribe/releases/latest';
export const RELEASES_URL = 'https://github.com/morethancoder/transcribe/releases/latest';

const DISMISSED_KEY = 'transcrape-update-dismissed';

/** One check per session — `undefined` means it hasn't run yet. */
let checked: Promise<UpdateInfo | null> | undefined;

/**
 * The newer release, or null when this is already the latest (and on any
 * failure — offline is not a reason to bother anyone).
 */
export function checkForUpdate(): Promise<UpdateInfo | null> {
	if (!browser) return Promise.resolve(null);
	checked ??= fetchLatest();
	return checked;
}

async function fetchLatest(): Promise<UpdateInfo | null> {
	try {
		const res = await fetch(RELEASES_API, {
			headers: { accept: 'application/vnd.github+json' }
		});
		if (!res.ok) return null;
		const release: { tag_name?: string; html_url?: string } = await res.json();
		const version = String(release.tag_name ?? '').replace(/^v/, '');
		if (!isNewer(version, pkg.version)) return null;
		return { version, url: release.html_url ?? RELEASES_URL };
	} catch {
		return null;
	}
}

/** Plain numeric semver — exactly what the release workflow tags (`v0.2.0`). */
export function isNewer(candidate: string, current: string): boolean {
	const a = candidate.split('.').map(Number);
	const b = current.split('.').map(Number);
	if (!candidate || a.some(Number.isNaN) || b.some(Number.isNaN)) return false;
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const diff = (a[i] ?? 0) - (b[i] ?? 0);
		if (diff !== 0) return diff > 0;
	}
	return false;
}

/**
 * The banner is closable and stays closed — for that version. The next
 * release starts the conversation again, which is the polite frequency.
 */
export function isDismissed(version: string): boolean {
	if (!browser) return true;
	return localStorage.getItem(DISMISSED_KEY) === version;
}

export function dismiss(version: string): void {
	if (!browser) return;
	try {
		localStorage.setItem(DISMISSED_KEY, version);
	} catch {
		// private browsing — it just reappears next launch
	}
}
