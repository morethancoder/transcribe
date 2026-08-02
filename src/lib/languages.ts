/**
 * Languages the model is offered for — shared by the picker and the API guard,
 * so it stays free of UI concerns (the server imports it too). The English
 * names are only the fallback; the pickers localise codes through
 * `languageDisplay` in `$lib/format`.
 */
export const LANGUAGES: [string, string][] = [
	['auto', 'Auto-detect'],
	['ar', 'Arabic'],
	['zh', 'Chinese'],
	['nl', 'Dutch'],
	['en', 'English'],
	['fr', 'French'],
	['de', 'German'],
	['hi', 'Hindi'],
	['id', 'Indonesian'],
	['it', 'Italian'],
	['ja', 'Japanese'],
	['ko', 'Korean'],
	['fa', 'Persian'],
	['pl', 'Polish'],
	['pt', 'Portuguese'],
	['ru', 'Russian'],
	['es', 'Spanish'],
	['sv', 'Swedish'],
	['th', 'Thai'],
	['tr', 'Turkish'],
	['uk', 'Ukrainian'],
	['ur', 'Urdu'],
	['vi', 'Vietnamese']
];

export const LANGUAGE_CODES = new Set(LANGUAGES.map(([code]) => code));
