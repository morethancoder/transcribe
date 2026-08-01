import type { Phase } from './types';

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
 */
export const PROGRESS_MESSAGES: Record<Phase, string[]> = {
	preparing: [
		'Reading the file…',
		'Finding the audio track…',
		'Decoding to 16 kHz mono…',
		'Whisper only listens in mono — mixing the channels down…',
		'Almost ready to listen…'
	],
	transcribing: [
		'Listening…',
		'Working through the audio…',
		'Picking out words…',
		'Placing the timings…',
		'Still going — longer files take a while…',
		'Sorting the words into lines…',
		'Nothing is being uploaded; this is all running here…'
	],
	downloading: [
		'Fetching the model…',
		'This happens once per model…',
		'Large files, one time only…',
		'Downloading from Hugging Face…',
		'It resumes if the connection drops…'
	],
	translating: [
		'Translating to English…',
		'Reading the audio again, in English this time…',
		'Matching the translation to the timings…',
		'Still going — translation takes about as long as the transcript did…'
	]
};

/** How long each line stays up. Long enough to read, short enough to notice. */
export const MESSAGE_INTERVAL_MS = 4000;
