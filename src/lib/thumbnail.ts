/** Longest edge of a stored poster frame — small enough to sit in localStorage. */
const MAX_WIDTH = 192;

/**
 * Grab a poster frame from a video, entirely in the browser — the server
 * never sees the file until you actually transcribe. Takes either a `File`
 * (the web build's picker) or a URL the webview can already load (the app
 * build's asset protocol). Resolves to null for audio, for codecs the browser
 * can't decode, and for anything else that goes wrong: a thumbnail is
 * decoration, never a reason to block anything.
 */
export function videoThumbnail(source: File | string): Promise<string | null> {
	// A URL says nothing about its media type — the caller has already decided
	// by extension, and a wrong guess just falls out as an error frame → null.
	if (source instanceof File && !source.type.startsWith('video/')) return Promise.resolve(null);

	return new Promise((resolve) => {
		const owned = source instanceof File;
		const url = owned ? URL.createObjectURL(source) : source;
		const video = document.createElement('video');
		let settled = false;

		const done = (result: string | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			video.removeAttribute('src');
			video.load();
			if (owned) URL.revokeObjectURL(url);
			resolve(result);
		};

		// a frozen decode shouldn't leave the file card waiting forever
		const timer = setTimeout(() => done(null), 10_000);

		video.muted = true;
		video.playsInline = true;
		video.preload = 'metadata';
		// An asset-protocol URL is another origin to the webview; without this
		// the canvas taints and toDataURL throws. Blob URLs don't care.
		if (!owned) video.crossOrigin = 'anonymous';

		video.onloadedmetadata = () => {
			// a frame or two in — the very first frame is often black
			video.currentTime = Math.min(1, (video.duration || 0) / 2);
		};

		video.onseeked = () => {
			try {
				const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
				const canvas = document.createElement('canvas');
				canvas.width = Math.round(video.videoWidth * scale);
				canvas.height = Math.round(video.videoHeight * scale);
				if (!canvas.width || !canvas.height) return done(null);
				const ctx = canvas.getContext('2d');
				if (!ctx) return done(null);
				ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
				done(canvas.toDataURL('image/jpeg', 0.65));
			} catch {
				done(null); // tainted canvas or a codec the browser won't paint
			}
		};

		video.onerror = () => done(null);
		video.src = url;
	});
}
