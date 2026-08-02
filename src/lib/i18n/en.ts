/**
 * Every English string in the UI, and therefore the shape both languages must
 * fill — `ar.ts` satisfies the type this file defines. Parameterised lines are
 * functions rather than template markers, so a missing argument is a type
 * error instead of a `{placeholder}` shipped to a screen.
 *
 * What is *not* here: engine errors (they arrive from Rust or the server
 * already worded), file names, language codes, and numbers — the formatters in
 * `$lib/format` localise those digits-and-dates concerns themselves.
 */

export const en = {
	appName: 'Transcribe',

	nav: {
		transcribe: 'Transcribe',
		history: 'History',
		settings: 'Settings',
		toggleTheme: 'Toggle dark mode'
	},

	update: {
		available: (version: string) => `Version ${version} is out`,
		body: 'A new release is ready to download.',
		get: 'Get the update',
		dismiss: 'Not now'
	},

	home: {
		title: 'Transcribe a video or audio file',
		subtitle: 'Runs locally with Whisper — nothing leaves your device.',
		dropFine: 'Drop a video or audio file here, or click to choose',
		clickToChoose: 'Click to choose a video or audio file',
		tapToChoose: 'Tap to choose a video or audio file',
		removeFile: 'Remove file',
		spokenLanguage: 'Spoken language',
		spokenLanguageSummary: (language: string) => `Spoken language — ${language}`,
		transcribe: 'Transcribe',
		transcribeAnother: 'Transcribe another file',
		cancel: 'Cancel',
		downloadingModel: (model: string) => `Downloading ${model}`,
		downloadDetail: (received: string, total: string) =>
			`${received} of ${total} — one-time per model; transcription unlocks when it finishes.`,
		downloadFailed: 'Model download failed',
		retrying: (message: string) => `${message} — retrying automatically.`,
		failed: 'Transcription failed',
		complete: 'Transcription complete'
	},

	settings: {
		title: 'Settings',
		windowTitle: 'Settings — Transcribe',
		transcription: 'Transcription',
		checkingModel: 'Checking which model is installed…',
		downloadDetail: (received: string, total: string) =>
			`${received} of ${total} — one-time per model. You can leave this screen; it keeps going.`,
		modelUnavailable: 'Model unavailable',
		unknownError: 'Unknown error',
		engineUnreachable: 'Engine unreachable',
		transcribingWith: (model: string) => `Transcribing with ${model}`,

		spokenLanguage: 'Default spoken language',
		spokenLanguageLabel: 'Language of the audio',
		spokenLanguageHelp:
			'Where each transcription starts. Auto-detect is right almost always — set this only if you mostly work in one language. You can still change it per file before transcribing.',

		appLanguage: 'App language',
		appLanguageEnglish: 'English',
		appLanguageArabic: 'العربية',
		appLanguageSystem: 'System',
		appLanguageHelp: 'System follows the device language, and shows Arabic when the device does.',

		appearance: 'Appearance',
		light: 'Light',
		dark: 'Dark',
		system: 'System',
		appearanceHelp:
			'System follows the device, and keeps following it if the device switches while the app is open.',

		about: 'About',
		description: 'On-device video and audio transcription, powered by whisper.cpp.',
		privacy:
			'Audio and transcripts never leave this device. Transcribe only fetches the Whisper model from Hugging Face, and asks GitHub whether a newer version exists.',
		viewOnGitHub: 'View on GitHub',
		reportIssue: 'Report an issue',
		license: (license: string) => `${license} licensed. Transcription by`
	},

	models: {
		summary: (label: string, size: string) => `Transcription model — ${label} (${size})`,
		intro:
			'Bigger models hear better and take longer. The suggestion below is only a starting point — every model is available on every device, so if you want the most accurate one on a phone, take it.',
		suggestedPhone: 'Suggested for phones',
		suggestedDesktop: 'Suggested for desktop',
		downloaded: 'Downloaded',
		cantTranslate: "Can't translate",
		footnote:
			'Switching models downloads the new one the first time you use it. The old one stays on disk, so switching back is instant.',
		blurbs: {
			tiny: 'The fastest, and the least accurate — it drops words and mangles names, especially with an accent or background noise. Worth it on an old phone, or for a rough first pass.',
			base: 'Still very fast and barely any bigger. Reliable on clear speech in a quiet room; it starts to struggle once there is music or crosstalk.',
			small:
				'The sweet spot on a phone: accurate enough for real transcripts, small enough to load without trouble, and it finishes without flattening the battery.',
			medium:
				'Noticeably better than Small on hard audio. Fine on a laptop; on a phone expect a wait several times the length of the recording.',
			'large-v3-turbo':
				'Close to Large accuracy at a fraction of the time — the best default on a desktop. The one catch: it cannot translate, so translating pulls a second model.',
			'large-v3':
				'The most accurate option, and it translates without a second download. Roughly twice Turbo’s running time, and a heavy load for a phone — but nothing stops you choosing it.'
		} as Record<string, string>
	},

	history: {
		title: 'History',
		windowTitle: 'History — Transcribe',
		clear: 'Clear history',
		empty: 'No transcripts yet',
		emptyHelp: 'Everything you transcribe is kept here, on this device.',
		transcribeAFile: 'Transcribe a file',
		clearConfirm: 'Clear all history?',
		clearConfirmHelp: "Every saved transcript on this device is removed. This can't be undone.",
		cancel: 'Cancel',
		clearAction: 'Clear',
		cleared: 'History cleared',

		notFound: 'Transcript not found',
		notFoundHelp: 'It may have been deleted or saved in another browser.',
		back: 'Back to history',
		noPlayback:
			"Playback isn't available — the audio is only kept for a few hours after transcribing. The transcript is still fully editable.",
		deleteTranscript: 'Delete transcript',
		deleteConfirm: 'Delete this transcript?',
		deleteConfirmHelp: "This can't be undone.",
		deleteAction: 'Delete',
		deleted: 'Transcript deleted'
	},

	transcript: {
		heading: 'Transcript',
		edit: 'Edit',
		done: 'Done',
		copy: 'Copy',
		copied: 'Copied to clipboard',
		editingHint: 'Edits save as you type, and feed the copy and download buttons above.',
		english: 'English',
		translate: 'Translate to English',
		translated: 'Translated to English',
		translateNote: (model: string, size: string) =>
			`First translation downloads ${model} (${size}) — the model set for transcription can't translate. Picking one that can, under "Transcription model", avoids the second download.`,
		translationFailed: 'Translation failed',
		cancel: 'Cancel',
		jumpTo: (time: string) => `Jump to ${time}`,
		editAria: (time: string) => `Transcript at ${time}`
	},

	run: {
		preparing: 'Preparing audio',
		transcribing: 'Transcribing',
		downloading: 'Downloading translation model',
		translating: 'Translating to English',
		estimating: 'Estimating time…',
		stoppedEarly: 'The run stopped before it finished.'
	},

	eta: {
		seconds: 'a few seconds left',
		aboutSeconds: (s: number) => `about ${s} seconds left`,
		aboutMinutes: (m: number) => `about ${m} min left`,
		aboutHours: (h: number, m: number) => `about ${h} h ${m} min left`
	},

	progress: {
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
	},

	autoDetect: 'Auto-detect'
};

export type Messages = typeof en;
