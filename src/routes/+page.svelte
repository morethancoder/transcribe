<script lang="ts">
	import { onMount } from 'svelte';
	import Progress from '$lib/components/Progress.svelte';
	import Transcript from '$lib/components/Transcript.svelte';
	import { JobRun } from '$lib/job.svelte';
	import { LANGUAGES, languageLabel } from '$lib/languages';
	import { addEntry, estimateSpeed, type HistoryEntry } from '$lib/history';
	import { fmtSize } from '$lib/format';
	import { videoThumbnail } from '$lib/thumbnail';

	type ModelState = {
		status: 'missing' | 'downloading' | 'ready' | 'error';
		received: number;
		total: number;
		message?: string;
	};

	let file = $state<File | null>(null);
	let language = $state('auto');
	let entry = $state<HistoryEntry | null>(null);
	let model = $state<ModelState>({ status: 'missing', received: 0, total: 0 });
	/** Object URL for the picked file, so playback needs no upload round trip. */
	let mediaSrc = $state<string | null>(null);
	let thumbnail = $state<string | null>(null);

	const run = new JobRun();

	let mediaKind = $derived<'video' | 'audio'>(
		file?.type.startsWith('video/') ? 'video' : 'audio'
	);

	onMount(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const poll = async () => {
			try {
				const res = await fetch('/api/model');
				model = await res.json();
			} catch {
				model = { status: 'error', received: 0, total: 0, message: 'Server unreachable' };
			}
			if (model.status !== 'ready') timer = setTimeout(poll, 1500);
		};
		poll();
		return () => clearTimeout(timer);
	});

	function pick(f: File | undefined | null) {
		if (!f) return;
		releaseMedia();
		file = f;
		entry = null;
		run.error = '';
		mediaSrc = URL.createObjectURL(f);
		thumbnail = null;
		videoThumbnail(f).then((poster) => {
			// a slow decode can land after the next pick — ignore a stale result
			if (file === f) thumbnail = poster;
		});
	}

	function reset() {
		// the picker input is recreated with the drop zone, so it starts empty
		releaseMedia();
		file = null;
		entry = null;
		thumbnail = null;
		run.error = '';
	}

	function releaseMedia() {
		if (mediaSrc) URL.revokeObjectURL(mediaSrc);
		mediaSrc = null;
	}

	async function transcribe() {
		if (!file || run.running) return;
		entry = null;
		const started = Date.now();
		const params = new URLSearchParams({ language, name: file.name });
		const result = await run.run(
			`/api/transcribe?${params}`,
			{ method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: file },
			{ speed: estimateSpeed() }
		);
		if (!result || !file) return;

		const saved: HistoryEntry = {
			id: crypto.randomUUID(),
			jobId: run.jobId,
			name: file.name,
			size: file.size,
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

<div class="screen-stack">
	<div class="stack" data-gap="4">
		<h1 class="t-page">Transcribe a video or audio file</h1>
		<p class="t-secondary">Runs locally with Whisper — nothing leaves your Mac.</p>
	</div>

	{#if !file}
		<div
			class="card"
			role="group"
			aria-label="File drop zone"
			ondragover={(e) => e.preventDefault()}
			ondrop={(e) => {
				e.preventDefault();
				pick(e.dataTransfer?.files[0]);
			}}
		>
			<div class="stack" data-gap="12" data-align="center">
				<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m10 8.5 5 3.5-5 3.5Z"/><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M7 21h10M12 17v4"/></svg>
				<p class="t-body">Drop a video or audio file here</p>
			</div>
		</div>
	{:else}
		<div class="card">
			<div class="item">
				{#if thumbnail}
					<img class="thumb" src={thumbnail} alt="" />
				{/if}
				<span class="item-text">
					<span class="item-title t-ltr">{file.name}</span>
					<span class="item-sub">{fmtSize(file.size)}</span>
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
				label="Downloading Whisper model"
				detail="{fmtSize(model.received)} of {fmtSize(
					model.total
				)} — one-time setup; transcription unlocks when it finishes."
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
			<Progress value={run.progress} label={run.label} detail={run.detail} />
		</div>
		<button class="btn" data-variant="ghost" onclick={() => run.cancel()}>Cancel</button>
	{:else if !file}
		<!-- label opens the picker natively — no JS between click and chooser -->
		<label class="btn" data-variant="primary">
			Choose file
			<input
				type="file"
				accept="video/*,audio/*,.mkv,.m4a,.opus"
				hidden
				onchange={(e) => pick(e.currentTarget.files?.[0])}
			/>
		</label>
	{:else if !entry}
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
	.thumb {
		flex: 0 0 auto;
		inline-size: var(--sp-48);
		block-size: var(--sp-48);
		object-fit: cover;
		border-radius: var(--r-input);
		background: var(--surface-2);
	}
</style>
