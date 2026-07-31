/** Longest edge of a stored poster frame — small enough to sit in localStorage. */
const MAX_WIDTH = 192;

/**
 * Grab a poster frame from a video file, entirely in the browser — the server
 * never sees the file until you actually transcribe. Resolves to null for
 * audio, for codecs the browser can't decode, and for anything else that goes
 * wrong: a thumbnail is decoration, never a reason to block the upload.
 */
export function videoThumbnail(file: File): Promise<string | null> {
	if (!file.type.startsWith('video/')) return Promise.resolve(null);

	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const video = document.createElement('video');
		let settled = false;

		const done = (result: string | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			video.removeAttribute('src');
			video.load();
			URL.revokeObjectURL(url);
			resolve(result);
		};

		// a frozen decode shouldn't leave the file card waiting forever
		const timer = setTimeout(() => done(null), 10_000);

		video.muted = true;
		video.playsInline = true;
		video.preload = 'metadata';

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
