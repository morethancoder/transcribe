/**
 * Which language the *app* speaks — separate from the language being
 * transcribed, which is a property of each audio file.
 *
 * Three choices, defaulting to `system`: the device's language decides, and
 * today that resolves to Arabic for an Arabic device and English for
 * everything else. The resolved locale lives in a rune so that changing it in
 * Settings re-renders every string in place — no reload, no route change.
 *
 * Direction rides along with language: Arabic flips the document to RTL. The
 * layout survives the flip because the CSS is written in logical properties
 * throughout; the few things that must stay left-to-right (file names,
 * timestamps, version numbers) already wear `t-ltr`.
 */

import { browser } from '$app/environment';
import { en, type Messages } from './i18n/en';
import { ar } from './i18n/ar';

export type AppLanguage = 'en' | 'ar' | 'system';
export type Locale = 'en' | 'ar';

/** Kept in step with the boot script in app.html — same key, same values. */
const KEY = 'transcrape-app-language';

const DICTS: Record<Locale, Messages> = { en, ar };

const current = $state<{ pref: AppLanguage; locale: Locale }>({
	pref: 'system',
	locale: 'en'
});

/** What `system` means right now. */
export function systemLocale(): Locale {
	if (!browser) return 'en';
	return navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

function resolve(pref: AppLanguage): Locale {
	return pref === 'system' ? systemLocale() : pref;
}

/** Mirror the choice onto the document, where CSS and screen readers see it. */
function apply(): void {
	if (!browser) return;
	document.documentElement.lang = current.locale;
	document.documentElement.dir = current.locale === 'ar' ? 'rtl' : 'ltr';
}

/** Read the saved choice and set the document up. Called once by the layout. */
export function initI18n(): void {
	if (!browser) return;
	const raw = localStorage.getItem(KEY);
	current.pref = raw === 'en' || raw === 'ar' || raw === 'system' ? raw : 'system';
	current.locale = resolve(current.pref);
	apply();
}

export function appLanguage(): AppLanguage {
	return current.pref;
}

export function setAppLanguage(pref: AppLanguage): void {
	current.pref = pref;
	current.locale = resolve(pref);
	apply();
	if (!browser) return;
	try {
		localStorage.setItem(KEY, pref);
	} catch {
		// private browsing — the choice just won't survive a reload
	}
}

/** The resolved locale — for `Intl` formatters that want a tag, not a dict. */
export function locale(): Locale {
	return current.locale;
}

/**
 * The current dictionary. Reading it inside a template or `$derived` tracks
 * the locale rune, so `m().nav.history` is all a component needs to stay
 * translated.
 */
export function m(): Messages {
	return DICTS[current.locale];
}
