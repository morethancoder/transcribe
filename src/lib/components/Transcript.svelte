<script lang="ts">
	import { onMount } from 'svelte';
	import Progress from './Progress.svelte';
	import Player from './Player.svelte';
	import { JobRun } from '$lib/job.svelte';
	import { estimateSpeed, patchEntry, type HistoryEntry } from '$lib/history';
	import { baseName, download, fmtClock, languageName, toSrt, toText } from '$lib/format';
	import type { Segment } from '$lib/types';

	type Props = {
		entry: HistoryEntry;
		/** Playable URL for the source media, when we still have one. */
		mediaSrc?: string | null;
		mediaKind?: 'video' | 'audio';
	};

	let { entry = $bindable(), mediaSrc = null, mediaKind = 'audio' }: Props = $props();

	let view = $state<'original' | 'english'>('original');
	let modelReady = $state(true);
	let editing = $state(false);
	let currentTime = $state(0);
	let paused = $state(true);
	let rows = $state<HTMLElement[]>([]);
	const run = new JobRun();

	onMount(async () => {
		// translating pulls a second whisper model; say so before they commit
		try {
			const res = await fetch('/api/model?kind=translate');
			modelReady = (await res.json()).status === 'ready';
		} catch {
			modelReady = true;
		}
	});

	let showingTranslation = $derived(view === 'english' && !!entry.translation);
	let segments = $derived(showingTranslation ? entry.translation! : entry.segments);
	let shownLanguage = $derived(view === 'english' ? 'en' : entry.language);
	// an English transcript is already the translation
	let canTranslate = $derived(entry.language !== 'en' && !entry.translation);
	let suffix = $derived(view === 'english' && entry.language !== 'en' ? '-en' : '');

	/**
	 * The line to light up. Segments can have gaps between them, so this holds
	 * on to the last one that started rather than flickering off — but gives up
	 * a couple of seconds past its end, which is where a gap really is silence.
	 */
	let activeIndex = $derived.by(() => {
		if (!mediaSrc) return -1;
		const ms = currentTime * 1000;
		let found = -1;
		for (let i = 0; i < segments.length; i++) {
			if (segments[i].from > ms) break;
			found = i;
		}
		if (found >= 0 && ms > segments[found].to + 2000) return -1;
		return found;
	});

	/**
	 * Which word inside the active line is being spoken. Whisper's token
	 * offsets leave small gaps between words, so as with lines this holds the
	 * last word that started rather than blinking off between them — but only
	 * briefly, or a trailing pause would leave the final word lit.
	 */
	let activeWord = $derived.by(() => {
		const words = activeIndex >= 0 ? segments[activeIndex]?.words : undefined;
		if (!words?.length) return -1;
		const ms = currentTime * 1000;
		let found = -1;
		for (let i = 0; i < words.length; i++) {
			if (words[i].from > ms) break;
			found = i;
		}
		if (found >= 0 && ms > words[found].to + 700) return -1;
		return found;
	});

	// follow along while playing, but never yank the page out from under
	// someone who is reading ahead or editing
	$effect(() => {
		const row = rows[activeIndex];
		if (!row || paused || editing) return;
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		row.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
	});

	function seek(ms: number) {
		currentTime = ms / 1000;
	}

	/**
	 * Jump to the clicked word, or to the start of the line when the click
	 * lands on the timestamp or the space between words.
	 *
	 * The whole line stays a single <button> and words are plain spans — a
	 * button per word would be invalid nested-interactive markup, and would
	 * put every word in the tab order, turning one line into 30 tab stops.
	 * Keyboard activation targets the button itself, so it seeks to the line.
	 */
	function seekFromClick(event: MouseEvent, seg: Segment) {
		const wordEl = (event.target as Element | null)?.closest?.('[data-word]');
		const index = Number((wordEl as HTMLElement | null)?.dataset.word);
		const word = Number.isInteger(index) ? seg.words?.[index] : undefined;
		seek(word ? word.from : seg.from);
	}

	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	function editSegment(index: number, text: string) {
		// drop the word timings on an edited line — they describe the old
		// wording, so keeping them would highlight the wrong word
		const next: Segment[] = segments.map((s, i) =>
			i === index ? { from: s.from, to: s.to, text } : s
		);
		const patch = showingTranslation ? { translation: next } : { segments: next };
		entry = { ...entry, ...patch };
		// keystrokes update the view immediately; localStorage can lag behind
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => patchEntry(entry.id, patch), 400);
	}

	/** Grow a textarea to fit its content so no line is hidden behind a scrollbar. */
	function autosize(node: HTMLTextAreaElement) {
		const fit = () => {
			node.style.height = 'auto';
			node.style.height = `${node.scrollHeight}px`;
		};
		fit();
		node.addEventListener('input', fit);
		return { destroy: () => node.removeEventListener('input', fit) };
	}

	async function translate() {
		const result = await run.run(
			`/api/translate?job=${encodeURIComponent(entry.jobId)}`,
			{ method: 'POST' },
			{ durationMs: entry.durationMs, speed: estimateSpeed() }
		);
		if (!result) return;
		entry = { ...entry, translation: result.segments };
		patchEntry(entry.id, { translation: result.segments });
		view = 'english';
		window.mtui?.toast('Translated to English', { kind: 'success' });
	}

	async function copy() {
		await navigator.clipboard.writeText(toText(segments));
		window.mtui?.toast('Copied to clipboard');
	}
</script>

<div class="card">
	<div class="stack" data-gap="16">
		{#if mediaSrc}
			<Player
				src={mediaSrc}
				kind={mediaKind}
				poster={entry.thumbnail}
				bind:currentTime
				bind:paused
			/>
		{/if}

		<div class="row" data-align="between" data-wrap="on">
			<span class="row" data-gap="8">
				<span class="t-card">Transcript</span>
				<span class="badge">{languageName(shownLanguage)}</span>
			</span>
			<span class="row" data-gap="8">
				<button class="btn" data-variant="ghost" onclick={() => (editing = !editing)}>
					{editing ? 'Done' : 'Edit'}
				</button>
				<button class="btn" data-variant="ghost" onclick={copy}>Copy</button>
				<button
					class="btn"
					data-variant="ghost"
					onclick={() => download(`${baseName(entry.name)}${suffix}.txt`, toText(segments) + '\n')}
				>
					.txt
				</button>
				<button
					class="btn"
					data-variant="ghost"
					onclick={() => download(`${baseName(entry.name)}${suffix}.srt`, toSrt(segments))}
				>
					.srt
				</button>
			</span>
		</div>

		{#if entry.translation}
			<fieldset class="segmented">
				<label>
					<input type="radio" name="view-{entry.id}" value="original" bind:group={view} />
					<span>{languageName(entry.language)}</span>
				</label>
				<label>
					<input type="radio" name="view-{entry.id}" value="english" bind:group={view} />
					<span>English</span>
				</label>
			</fieldset>
		{/if}

		{#if editing}
			<p class="t-secondary">
				Edits save as you type, and feed the copy and download buttons above.
			</p>
		{/if}

		<div class="stack" data-gap="4">
			{#each segments as seg, i (i)}
				{#if editing}
					<div class="seg">
						<span class="t-label t-ltr seg-time">{fmtClock(seg.from)}</span>
						<textarea
							class="seg-edit"
							rows="1"
							aria-label="Transcript at {fmtClock(seg.from)}"
							value={seg.text}
							oninput={(e) => editSegment(i, e.currentTarget.value)}
							use:autosize
						></textarea>
					</div>
				{:else if mediaSrc}
					<button
						class="seg seg-seek"
						bind:this={rows[i]}
						data-active={i === activeIndex ? '' : undefined}
						onclick={(e) => seekFromClick(e, seg)}
					>
						<span class="t-label t-ltr seg-time">{fmtClock(seg.from)}</span>
						{#if seg.words?.length}
							<span class="t-body"
								>{#each seg.words as word, w (w)}<span
										class="word"
										data-word={w}
										title="Jump to {fmtClock(word.from)}"
										data-spoken={i === activeIndex && w === activeWord ? '' : undefined}
										>{word.text}</span
									>{' '}{/each}</span
							>
						{:else}
							<span class="t-body">{seg.text}</span>
						{/if}
					</button>
				{:else}
					<div class="seg">
						<span class="t-label t-ltr seg-time">{fmtClock(seg.from)}</span>
						<span class="t-body">{seg.text}</span>
					</div>
				{/if}
			{/each}
		</div>

		{#if run.running}
			<Progress value={run.progress} label={run.label} detail={run.detail} />
			<button class="btn" data-variant="ghost" onclick={() => run.cancel()}>Cancel</button>
		{:else if canTranslate}
			<div class="stack" data-gap="8">
				<button class="btn" data-variant="secondary" onclick={translate}>
					Translate to English
				</button>
				{#if !modelReady}
					<span class="t-secondary">
						First translation downloads a second Whisper model (~515 MB) — the transcription
						model can't translate.
					</span>
				{/if}
			</div>
		{/if}

		{#if run.error}
			<div class="alert" data-status="danger">
				<span class="icon" data-icon="circle-x"></span>
				<div>
					<span class="alert-title">Translation failed</span>
					<p>{run.error}</p>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	/* One transcript line. A <button> when it can seek, a <div> otherwise —
	   same box either way, so the list doesn't shift when media is missing. */
	.seg {
		display: flex;
		align-items: start;
		gap: var(--sp-12);
		inline-size: 100%;
		padding: var(--sp-8);
		border: 0;
		border-radius: var(--r-input);
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: start;
		transition: background-color var(--t-micro) var(--ease);
	}

	.seg-time {
		flex: 0 0 auto;
		min-inline-size: 3rem;
		padding-block-start: 0.15em; /* optical: align the label to the first line */
	}

	.seg-seek {
		cursor: pointer;
	}

	.seg-seek:hover {
		background: var(--surface-2);
	}

	.seg[data-active] {
		background: var(--accent-tint);
		color: var(--accent-text);
	}

	/* The word being spoken, inside the already-tinted active line. Padding is
	   cancelled by an equal negative margin so lighting a word never reflows
	   the sentence around it. */
	.word {
		border-radius: var(--r-chip);
		padding-inline: var(--sp-4);
		margin-inline: calc(-1 * var(--sp-4));
		transition: background-color var(--t-micro) var(--ease);
	}

	/* hint that words are individually seekable */
	.seg-seek .word:hover {
		background: var(--surface-3);
	}

	/* after the hover rule, and equally specific, so the spoken word keeps its
	   accent fill while the pointer is over it */
	.seg .word[data-spoken] {
		background: var(--accent);
		color: var(--on-accent);
	}

	@media (prefers-reduced-motion: reduce) {
		.word {
			transition: none;
		}
	}

	.seg-edit {
		flex: 1 1 auto;
		min-inline-size: 0;
		padding: var(--sp-8);
		border: 0;
		border-radius: var(--r-input);
		background: var(--surface-2);
		color: inherit;
		font: inherit;
		resize: none;
		overflow: hidden;
	}

	.seg-edit:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
