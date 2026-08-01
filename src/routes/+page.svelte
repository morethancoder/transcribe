<script lang="ts">
	import { onMount } from 'svelte';
	import Progress from '$lib/components/Progress.svelte';
	import Transcript from '$lib/components/Transcript.svelte';
	import { JobRun } from '$lib/job.svelte';
	import { DEFAULT_MODEL, getModel, type ModelId } from '$lib/models';
	import { LANGUAGES, languageLabel } from '$lib/languages';
	import { loadLanguage } from '$lib/settings';
	import { addEntry, estimateSpeed, type HistoryEntry } from '$lib/history';
	import { fmtSize } from '$lib/format';
	import { videoThumbnail } from '$lib/thumbnail';
	import * as transport from '$lib/transport';
	import type { ModelStatus, Source } from '$lib/transport';

	const VIDEO_EXTENSIONS = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', '3gp'];

	/**
	 * What is going to be transcribed.
	 *
	 * Two shapes, because the backends differ: the server takes the bytes, so
	 * `file` is a real `File` and everything the browser can do with one — poster
	 * frame, size, playback without a round trip — comes free. The app build gets
	 * a path from a native dialog instead, and none of that is available from a
	 * path alone, so those extras are simply absent there.
	 */
	let source = $state<Source | null>(null);
	let language = $state('auto');
	let entry = $state<HistoryEntry | null>(null);
	let model = $state<ModelStatus>({ status: 'missing', received: 0, total: 0 });
	/** Object URL for a picked File, so playback needs no upload round trip. */
	let mediaSrc = $state<string | null>(null);
	let thumbnail = $state<string | null>(null);

	const run = new JobRun();
	/** Which backend is behind the screens — see $lib/transport. */
	const app = transport.isApp();

	let file = $derived(source?.kind === 'file' ? source.file : null);
	let sourceName = $derived(
		source ? (source.kind === 'file' ? source.file.name : source.name) : ''
	);
	let sourceSize = $derived(source?.kind === 'file' ? source.file.size : null);

	let mediaKind = $derived<'video' | 'audio'>(
		file
			? file.type.startsWith('video/')
				? 'video'
				: 'audio'
			: VIDEO_EXTENSIONS.includes(sourceName.split('.').pop()?.toLowerCase() ?? '')
				? 'video'
				: 'audio'
	);

	let selectedModel = $derived(model.selected ?? DEFAULT_MODEL);

	let pollTimer: ReturnType<typeof setTimeout> | undefined;

	async function poll() {
		try {
			model = await transport.modelStatus();
		} catch {
			model = { status: 'error', received: 0, total: 0, message: 'Engine unreachable' };
		}
		// Keep polling while a download is in flight; a switch to a model that
		// isn't on disk yet restarts exactly this loop.
		clearTimeout(pollTimer);
		if (model.status !== 'ready') pollTimer = setTimeout(poll, 1500);
	}

	onMount(() => {
		// The picker for this lives in Settings; here it's only a starting value.
		language = loadLanguage();
		poll();
		return () => clearTimeout(pollTimer);
	});

	function pick(f: File | undefined | null) {
		if (!f) return;
		releaseMedia();
		source = { kind: 'file', file: f };
		entry = null;
		run.error = '';
		mediaSrc = URL.createObjectURL(f);
		thumbnail = null;
		videoThumbnail(f).then((poster) => {
			// a slow decode can land after the next pick — ignore a stale result
			if (file === f) thumbnail = poster;
		});
	}

	/**
	 * The app build's picker. A webview `File` carries no path, and Rust opens
	 * the file itself, so the native dialog is the only thing that can bridge
	 * the two — see `$lib/transport`.
	 */
	async function pickNative() {
		const picked = await transport.pickFile();
		if (!picked) return;
		releaseMedia();
		source = picked;
		entry = null;
		thumbnail = null;
		run.error = '';
	}

	function reset() {
		// the picker input is recreated with the drop zone, so it starts empty
		releaseMedia();
		source = null;
		entry = null;
		thumbnail = null;
		run.error = '';
	}

	function releaseMedia() {
		if (mediaSrc) URL.revokeObjectURL(mediaSrc);
		mediaSrc = null;
	}

	async function transcribe() {
		if (!source || run.running) return;
		entry = null;
		const started = Date.now();
		const result = await run.run(
			transport.transcribe({
				runId: crypto.randomUUID(),
				source,
				language
			}),
			{ speed: estimateSpeed() }
		);
		if (!result || !source) return;

		const saved: HistoryEntry = {
			id: crypto.randomUUID(),
			jobId: run.jobId,
			name: sourceName,
			size: sourceSize ?? 0,
			createdAt: Date.now(),
			kind: mediaKind,
			thumbnail,
			durationMs: run.durationMs,
			tookMs: Date.now() - started,
			language: result.language,
			segments: result.segments,
			translation: null
		};
		addEntry(saved);
		entry = saved;
		window.mtui?.toast('Transcription complete', { kind: 'success' });
	}
</script>

<!-- One set of contents, two wrappers: a <label> wrapping a file input on the
     web, a <button> that opens the native dialog in the app. -->
{#snippet dropContents()}
	<div class="stack" data-gap="12" data-align="center">
		<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m10 8.5 5 3.5-5 3.5Z"/><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M7 21h10M12 17v4"/></svg>
		<!-- exactly one of these shows, chosen by pointer type: "drop" is a lie on
		     touch, "tap" is a lie with a mouse -->
		<p class="t-body drop-fine">
			{app ? 'Click to choose a video or audio file' : 'Drop a video or audio file here, or click to choose'}
		</p>
		<p class="t-body drop-touch">Tap to choose a video or audio file</p>
	</div>
{/snippet}

<div class="screen-stack">
	<div class="stack" data-gap="4">
		<h1 class="t-page">Transcribe a video or audio file</h1>
		<p class="t-secondary">Runs locally with Whisper — nothing leaves your device.</p>
	</div>

	{#if !source}
		{#if app}
			<!-- The app build can't use the input below: a webview File has no path
			     for Rust to open, so the native dialog does the picking. -->
			<button class="card drop" onclick={pickNative}>
				{@render dropContents()}
			</button>
		{:else}
			<!-- The card *is* the picker: the label opens the chooser natively, with
			     no JS between the tap and the dialog. That matters on a phone, where
			     the bare drop target this used to be was inert — there is nothing to
			     drag. The input stays focusable (not `hidden`) so it keeps its place
			     in the tab order; .drop-input hides it visually and the ring goes on
			     the card. -->
			<label
				class="card drop"
				ondragover={(e) => e.preventDefault()}
				ondrop={(e) => {
					e.preventDefault();
					pick(e.dataTransfer?.files[0]);
				}}
			>
				<input
					type="file"
					accept="video/*,audio/*,.mkv,.m4a,.opus"
					class="drop-input"
					onchange={(e) => pick(e.currentTarget.files?.[0])}
				/>
				{@render dropContents()}
			</label>
		{/if}
	{:else}
		<div class="card">
			<div class="item">
				{#if thumbnail}
					<img class="thumb" src={thumbnail} alt="" />
				{/if}
				<span class="item-text">
					<span class="item-title t-ltr">{sourceName}</span>
					<!-- a path tells us nothing about size until the engine opens it -->
					{#if sourceSize !== null}
						<span class="item-sub">{fmtSize(sourceSize)}</span>
					{/if}
				</span>
				{#if !run.running}
					<button
						class="btn"
						data-variant="ghost"
						data-size="icon"
						aria-label="Remove file"
						onclick={reset}
					>
						<span class="icon" data-icon="x"></span>
					</button>
				{/if}
			</div>
		</div>

		{#if !run.running && !entry}
			<!-- auto-detect covers almost every file, so the picker stays folded away -->
			<details class="accordion">
				<summary>Spoken language — {languageLabel(language)}</summary>
				<div class="accordion-body">
					<x-select>
						<label class="field">
							<span class="t-label">Spoken language</span>
							<span class="select">
								<select bind:value={language}>
									{#each LANGUAGES as [code, name] (code)}
										<option value={code}>{name}</option>
									{/each}
								</select>
							</span>
						</label>
					</x-select>
				</div>
			</details>
		{/if}
	{/if}

	{#if model.status === 'downloading'}
		<div class="card">
			<Progress
				value={model.total ? model.received / model.total : 0}
				label="Downloading {getModel(selectedModel).label}"
				detail="{fmtSize(model.received)} of {fmtSize(
					model.total
				)} — one-time per model; transcription unlocks when it finishes."
				phase="downloading"
			/>
		</div>
	{:else if model.status === 'error'}
		<div class="alert" data-status="danger">
			<span class="icon" data-icon="alert-triangle"></span>
			<div>
				<span class="alert-title">Model download failed</span>
				<p>{model.message ?? 'Unknown error'} — retrying automatically.</p>
			</div>
		</div>
	{/if}

	{#if run.running}
		<div class="card">
			<Progress value={run.progress} label={run.label} detail={run.detail} phase={run.phase} />
		</div>
		<button class="btn" data-variant="ghost" onclick={() => run.cancel()}>Cancel</button>
	{:else if source && !entry}
		<button
			class="btn"
			data-variant="primary"
			disabled={model.status !== 'ready'}
			onclick={transcribe}
		>
			Transcribe
		</button>
	{/if}

	{#if run.error}
		<div class="alert" data-status="danger">
			<span class="icon" data-icon="circle-x"></span>
			<div>
				<span class="alert-title">Transcription failed</span>
				<p>{run.error}</p>
			</div>
		</div>
	{/if}

	{#if entry}
		<Transcript bind:entry={() => entry!, (v) => (entry = v)} {mediaSrc} {mediaKind} />
		<button class="btn" data-variant="ghost" onclick={reset}>Transcribe another file</button>
	{/if}
</div>

<style>
	.drop {
		position: relative;
		display: block;
		cursor: pointer;
		transition: background-color var(--t-micro) var(--ease);
	}

	.drop:hover {
		background: var(--surface-2);
	}

	/* Visually hidden but still focusable — `hidden` would drop the input out of
	   the tab order, leaving the picker unreachable by keyboard. */
	.drop-input {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		margin: -1px;
		padding: 0;
		border: 0;
		overflow: hidden;
		white-space: nowrap;
		clip-path: inset(50%);
	}

	/* the input is invisible, so the card wears its focus ring */
	.drop:has(.drop-input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.drop-touch {
		display: none;
	}

	@media (pointer: coarse) {
		.drop-fine {
			display: none;
		}

		.drop-touch {
			display: block;
		}
	}

	.thumb {
		flex: 0 0 auto;
		inline-size: var(--sp-48);
		block-size: var(--sp-48);
		object-fit: cover;
		border-radius: var(--r-input);
		background: var(--surface-2);
	}
</style>
