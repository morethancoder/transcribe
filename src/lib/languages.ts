/** Languages the model is offered for — shared by the picker and the API guard. */
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

export function languageLabel(code: string): string {
	return LANGUAGES.find(([c]) => c === code)?.[1] ?? code;
}
