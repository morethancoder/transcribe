/**
 * The Whisper models transcrape can download, and what picking one costs you.
 *
 * Shared by the browser and the server on purpose: the picker in the UI and the
 * download on disk have to agree on file names and sizes, and a second copy of
 * this table would drift. The Rust engine mirrors it in
 * `src-tauri/src/engine/model.rs` for the app build.
 *
 * Every entry is a quantised (`q5`) build — roughly a third the size of the
 * float original for a difference you can't hear in a transcript. Sizes are the
 * real `content-length` from Hugging Face, not estimates.
 */

export type ModelId = 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo' | 'large-v3';

export type Model = {
	id: ModelId;
	/** Name on disk, which is also its name on Hugging Face. */
	file: string;
	label: string;
	bytes: number;
	/**
	 * Whether this model can translate to English.
	 *
	 * `large-v3-turbo` cannot: it silently ignores whisper's `-tr` flag and
	 * hands back the source language. Every other model here does, which means
	 * choosing one of them makes "Translate to English" free — there is no
	 * second model to fetch.
	 */
	translates: boolean;
	/** Honest one-liner about the trade. */
	blurb: string;
};

export const MODELS: Model[] = [
	{
		id: 'tiny',
		file: 'ggml-tiny-q5_1.bin',
		label: 'Tiny',
		bytes: 32_152_673,
		translates: true,
		blurb:
			'The fastest, and the least accurate — it drops words and mangles names, especially with an accent or background noise. Worth it on an old phone, or for a rough first pass.'
	},
	{
		id: 'base',
		file: 'ggml-base-q5_1.bin',
		label: 'Base',
		bytes: 59_707_625,
		translates: true,
		blurb:
			'Still very fast and barely any bigger. Reliable on clear speech in a quiet room; it starts to struggle once there is music or crosstalk.'
	},
	{
		id: 'small',
		file: 'ggml-small-q5_1.bin',
		label: 'Small',
		bytes: 190_085_487,
		translates: true,
		blurb:
			'The sweet spot on a phone: accurate enough for real transcripts, small enough to load without trouble, and it finishes without flattening the battery.'
	},
	{
		id: 'medium',
		file: 'ggml-medium-q5_0.bin',
		label: 'Medium',
		bytes: 539_212_467,
		translates: true,
		blurb:
			'Noticeably better than Small on hard audio. Fine on a laptop; on a phone expect a wait several times the length of the recording.'
	},
	{
		id: 'large-v3-turbo',
		file: 'ggml-large-v3-turbo-q5_0.bin',
		label: 'Large v3 Turbo',
		bytes: 574_041_195,
		translates: false,
		blurb:
			'Close to Large accuracy at a fraction of the time — the best default on a desktop. The one catch: it cannot translate, so translating pulls a second model.'
	},
	{
		id: 'large-v3',
		file: 'ggml-large-v3-q5_0.bin',
		label: 'Large v3',
		bytes: 1_081_140_203,
		translates: true,
		blurb:
			'The most accurate option, and it translates without a second download. Roughly twice Turbo’s running time, and a heavy load for a phone — but nothing stops you choosing it.'
	}
];

/** What transcrape has always used, and still the right default on a desktop. */
export const DEFAULT_MODEL: ModelId = 'large-v3-turbo';

/**
 * Filled in when the chosen model can't translate. Medium is the smallest
 * model that translates well enough to be worth the download.
 */
export const FALLBACK_TRANSLATE_MODEL: ModelId = 'medium';

/** Suggested starting point per device. Only ever a suggestion — the picker
 *  offers every model on every platform. */
export const SUGGESTED: Record<'phone' | 'desktop', ModelId> = {
	phone: 'small',
	desktop: 'large-v3-turbo'
};

export function getModel(id: ModelId): Model {
	return MODELS.find((m) => m.id === id) ?? MODELS.find((m) => m.id === DEFAULT_MODEL)!;
}

export function isModelId(value: unknown): value is ModelId {
	return typeof value === 'string' && MODELS.some((m) => m.id === value);
}

/**
 * Which model translates, given the one chosen for transcription — itself when
 * it can, otherwise the fallback. Saves a 500 MB download for anyone who picked
 * a model that already does both.
 */
export function translateModelFor(id: ModelId): ModelId {
	return getModel(id).translates ? id : FALLBACK_TRANSLATE_MODEL;
}

/**
 * A phone, as far as model choice is concerned: a touch screen with no mouse.
 * Deliberately not user-agent sniffing — the question is whether this device is
 * likely to struggle with a gigabyte model, and "coarse pointer, no hover" is a
 * better proxy for that than a string that lies.
 */
export function looksLikePhone(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false;
	return window.matchMedia('(pointer: coarse) and (hover: none)').matches;
}
