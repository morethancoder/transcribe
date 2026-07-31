import type { Segment } from './types';

export function fmtSize(bytes: number): string {
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** m:ss (or h:mm:ss past an hour) — timestamps and elapsed time. */
export function fmtClock(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	const mm = `${m}`.padStart(h ? 2 : 1, '0');
	const ss = `${sec}`.padStart(2, '0');
	return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Rounded, human phrasing for a countdown — "about 3 min left" reads better
 *  than a ticking 02:59 when the estimate is only accurate to ±20%. */
export function fmtEta(ms: number): string {
	const s = Math.round(ms / 1000);
	if (s < 10) return 'a few seconds left';
	if (s < 60) return `about ${Math.round(s / 10) * 10} seconds left`;
	const m = Math.round(s / 60);
	if (m < 60) return `about ${m} min left`;
	const h = Math.floor(m / 60);
	return `about ${h} h ${m % 60} min left`;
}

export function fmtDate(ts: number): string {
	return new Date(ts).toLocaleString(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	});
}

export function languageName(code: string): string {
	try {
		return new Intl.DisplayNames(undefined, { type: 'language' }).of(code) ?? code;
	} catch {
		return code;
	}
}

export function toText(segments: Segment[]): string {
	return segments.map((s) => s.text).join('\n');
}

export function toSrt(segments: Segment[]): string {
	const stamp = (ms: number) => {
		const h = `${Math.floor(ms / 3600000)}`.padStart(2, '0');
		const m = `${Math.floor((ms % 3600000) / 60000)}`.padStart(2, '0');
		const s = `${Math.floor((ms % 60000) / 1000)}`.padStart(2, '0');
		return `${h}:${m}:${s},${`${ms % 1000}`.padStart(3, '0')}`;
	};
	return segments
		.map((s, i) => `${i + 1}\n${stamp(s.from)} --> ${stamp(s.to)}\n${s.text}\n`)
		.join('\n');
}

export function download(name: string, content: string): void {
	const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

export function baseName(filename: string): string {
	return filename.replace(/\.[^.]+$/, '') || 'transcript';
}
