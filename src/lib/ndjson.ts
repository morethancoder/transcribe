/** Read a newline-delimited JSON response as it streams in. */
export async function* readNdjson<T>(res: Response): AsyncGenerator<T> {
	const reader = res.body?.getReader();
	if (!reader) return;
	const decoder = new TextDecoder();
	let buf = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buf += decoder.decode(value, { stream: true });
		let nl: number;
		while ((nl = buf.indexOf('\n')) !== -1) {
			const line = buf.slice(0, nl).trim();
			buf = buf.slice(nl + 1);
			if (line) yield JSON.parse(line) as T;
		}
	}
	if (buf.trim()) yield JSON.parse(buf.trim()) as T;
}
