<script lang="ts">
	import { onMount } from 'svelte';
	import ModelPicker from '$lib/components/ModelPicker.svelte';
	import { LANGUAGES } from '$lib/languages';
	import { getModel, type ModelId } from '$lib/models';
	import {
		loadLanguage,
		loadTheme,
		saveLanguage,
		saveTheme,
		type ThemePreference
	} from '$lib/settings';
	import * as transport from '$lib/transport';
	import type { ModelStatus } from '$lib/transport';
	import pkg from '../../../package.json';

	let model = $state<ModelStatus>({ status: 'missing', received: 0, total: 0 });
	let language = $state('auto');
	let theme = $state<ThemePreference>('system');
	let pollTimer: ReturnType<typeof setTimeout> | undefined;

	let selectedModel = $derived(model.selected);

	onMount(() => {
		language = loadLanguage();
		theme = loadTheme();
		poll();
		return () => clearTimeout(pollTimer);
	});

	async function poll() {
		try {
			model = await transport.modelStatus();
		} catch {
			model = { status: 'error', received: 0, total: 0, message: 'Engine unreachable' };
		}
		clearTimeout(pollTimer);
		// keep polling only while something is actually downloading
		if (model.status === 'downloading') pollTimer = setTimeout(poll, 1500);
	}

	async function chooseModel(id: ModelId) {
		if (id === selectedModel) return;
		model = { ...model, selected: id }; // optimistic, so the radio moves at once
		try {
			model = await transport.selectModel(id);
			window.mtui?.toast(`Transcribing with ${getModel(id).label}`);
		} catch (e) {
			model = {
				status: 'error',
				received: 0,
				total: 0,
				message: e instanceof Error ? e.message : 'Engine unreachable'
			};
		}
		clearTimeout(pollTimer);
		if (model.status === 'downloading') pollTimer = setTimeout(poll, 1500);
	}

	function chooseLanguage(code: string) {
		language = code;
		saveLanguage(code);
	}

	function chooseTheme(next: ThemePreference) {
		theme = next;
		saveTheme(next);
	}
</script>

<svelte:head><title>Settings — Transcrape</title></svelte:head>

<div class="screen-stack">
	<h1 class="t-page">Settings</h1>

	<!-- Model ---------------------------------------------------------------->
	<section class="stack" data-gap="8">
		<h2 class="t-card">Transcription</h2>
		{#if selectedModel}
			<ModelPicker
				selected={selectedModel}
				available={model.available ?? []}
				onSelect={chooseModel}
			/>
		{:else}
			<div class="card"><span class="t-secondary">Checking which model is installed…</span></div>
		{/if}

		{#if model.status === 'downloading'}
			<p class="t-secondary">
				Downloading {selectedModel ? getModel(selectedModel).label : 'the model'} —
				{Math.round(model.total ? (model.received / model.total) * 100 : 0)}%. You can leave
				this screen; it keeps going.
			</p>
		{:else if model.status === 'error'}
			<div class="alert" data-status="danger">
				<span class="icon" data-icon="alert-triangle"></span>
				<div>
					<span class="alert-title">Model unavailable</span>
					<p>{model.message ?? 'Unknown error'}</p>
				</div>
			</div>
		{/if}
	</section>

	<!-- Language ------------------------------------------------------------->
	<section class="stack" data-gap="8">
		<h2 class="t-card">Default spoken language</h2>
		<div class="card">
			<div class="stack" data-gap="12">
				<x-select>
					<label class="field">
						<span class="t-label">Language of the audio</span>
						<span class="select">
							<select value={language} onchange={(e) => chooseLanguage(e.currentTarget.value)}>
								{#each LANGUAGES as [code, name] (code)}
									<option value={code}>{name}</option>
								{/each}
							</select>
						</span>
					</label>
				</x-select>
				<p class="t-secondary">
					Where each transcription starts. Auto-detect is right almost always — set this only
					if you mostly work in one language. You can still change it per file before
					transcribing.
				</p>
			</div>
		</div>
	</section>

	<!-- Appearance ----------------------------------------------------------->
	<section class="stack" data-gap="8">
		<h2 class="t-card">Appearance</h2>
		<div class="card">
			<div class="stack" data-gap="12">
				<fieldset class="segmented" style="--seg-count: 3">
					<label>
						<input
							type="radio"
							name="theme"
							value="light"
							checked={theme === 'light'}
							onchange={() => chooseTheme('light')}
						/>
						<span>Light</span>
					</label>
					<label>
						<input
							type="radio"
							name="theme"
							value="dark"
							checked={theme === 'dark'}
							onchange={() => chooseTheme('dark')}
						/>
						<span>Dark</span>
					</label>
					<label>
						<input
							type="radio"
							name="theme"
							value="system"
							checked={theme === 'system'}
							onchange={() => chooseTheme('system')}
						/>
						<span>System</span>
					</label>
				</fieldset>
				<p class="t-secondary">
					System follows the device, and keeps following it if the device switches while the
					app is open.
				</p>
			</div>
		</div>
	</section>

	<!-- About ---------------------------------------------------------------->
	<section class="stack" data-gap="8">
		<h2 class="t-card">About</h2>
		<div class="card">
			<div class="stack" data-gap="12">
				<div class="stack" data-gap="4">
					<span class="t-card">Transcrape <span class="badge t-ltr">v{pkg.version}</span></span>
					<p class="t-secondary">{pkg.description}</p>
				</div>

				<p class="t-secondary">
					Audio and transcripts never leave this device. The only thing transcrape fetches is
					the Whisper model itself, from Hugging Face.
				</p>

				<div class="row" data-gap="8" data-wrap="on">
					<a
						class="btn"
						href={pkg.homepage}
						target="_blank"
						rel="noreferrer noopener"
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a12 12 0 0 0-3.79 23.4c.6.1.82-.26.82-.58l-.01-2.02c-3.34.73-4.04-1.6-4.04-1.6-.55-1.4-1.34-1.77-1.34-1.77-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22l-.01 3.29c0 .32.21.69.82.57A12 12 0 0 0 12 .5Z"/></svg>
						View on GitHub
					</a>
					<a
						class="btn"
						data-variant="ghost"
						href="{pkg.homepage}/issues"
						target="_blank"
						rel="noreferrer noopener"
					>
						Report an issue
					</a>
				</div>

				<p class="t-secondary">
					{pkg.license} licensed. Transcription by
					<a href="https://github.com/ggml-org/whisper.cpp" target="_blank" rel="noreferrer noopener">whisper.cpp</a>.
				</p>
			</div>
		</div>
	</section>
</div>

<style>
	/* Sections are pure grouping — the screen-stack gap already spaces them. */
	section {
		min-inline-size: 0;
	}
</style>
