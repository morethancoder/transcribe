/**
 * Preferences that live on the device.
 *
 * Only two of them: the theme and the language a new transcription starts on.
 * The model isn't here because it isn't a device preference — it's a file on
 * disk that the engine loads, so the server owns it (see `$lib/server/model`)
 * and the settings screen just drives that API.
 *
 * Written straight to localStorage rather than through a store: both values are
 * read once at mount and changed by a click, so a reactive layer between them
 * and the two screens that use them would be ceremony.
 */

import { browser } from '$app/environment';

const THEME_KEY = 'transcrape-theme';
const LANGUAGE_KEY = 'transcrape-language';

/** `system` follows the OS, and keeps following it when the OS changes. */
export type ThemePreference = 'light' | 'dark' | 'system';

export function loadTheme(): ThemePreference {
	if (!browser) return 'system';
	const raw = localStorage.getItem(THEME_KEY);
	return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

export function saveTheme(preference: ThemePreference): void {
	if (!browser) return;
	try {
		localStorage.setItem(THEME_KEY, preference);
	} catch {
		// private browsing — the choice just won't survive a reload
	}
	applyTheme(preference);
}

/** What `system` currently means. */
export function systemTheme(): 'light' | 'dark' {
	if (!browser || !window.matchMedia) return 'light';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
	return preference === 'system' ? systemTheme() : preference;
}

/** Paint it. The same attribute the boot script in app.html sets. */
export function applyTheme(preference: ThemePreference): void {
	if (!browser) return;
	document.documentElement.dataset.theme = resolveTheme(preference);
}

/**
 * Keep `system` honest: the OS theme can change while the app is open, and a
 * preference that only resolved once at startup would quietly stop following.
 * Returns a teardown for the caller's `onMount`.
 */
export function watchSystemTheme(onChange: () => void): () => void {
	if (!browser || !window.matchMedia) return () => {};
	const query = window.matchMedia('(prefers-color-scheme: dark)');
	query.addEventListener('change', onChange);
	return () => query.removeEventListener('change', onChange);
}

/**
 * The spoken language a new transcription starts on — a default, not a lock.
 * The home screen still offers a per-file override, because the language of the
 * next file is a property of that file, not of whoever is using the app.
 */
export function loadLanguage(): string {
	if (!browser) return 'auto';
	return localStorage.getItem(LANGUAGE_KEY) ?? 'auto';
}

export function saveLanguage(code: string): void {
	if (!browser) return;
	try {
		localStorage.setItem(LANGUAGE_KEY, code);
	} catch {
		// as above — not worth failing a click over
	}
}
