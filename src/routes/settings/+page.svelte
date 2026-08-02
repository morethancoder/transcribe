<script lang="ts">
	import { onMount } from 'svelte';
	import ModelPicker from '$lib/components/ModelPicker.svelte';
	import Progress from '$lib/components/Progress.svelte';
	import { LANGUAGES } from '$lib/languages';
	import { getModel, type ModelId } from '$lib/models';
	import { fmtSize, languageDisplay } from '$lib/format';
	import {
		loadLanguage,
		loadTheme,
		saveLanguage,
		saveTheme,
		type ThemePreference
	} from '$lib/settings';
	import { appLanguage, locale, m, setAppLanguage, type AppLanguage } from '$lib/i18n.svelte';
	import { checkForUpdate, type UpdateInfo } from '$lib/update';
	import * as transport from '$lib/transport';
	import type { ModelStatus } from '$lib/transport';
	import pkg from '../../../package.json';

	let model = $state<ModelStatus>({ status: 'missing', received: 0, total: 0 });
	let language = $state('auto');
	let theme = $state<ThemePreference>('system');
	let update = $state<UpdateInfo | null>(null);
	let pollTimer: ReturnType<typeof setTimeout> | undefined;

	let selectedModel = $derived(model.selected);
	// re-read on locale change, so the checked radio follows along
	let uiLanguage = $derived(appLanguage());

	onMount(() => {
		language = loadLanguage();
		theme = loadTheme();
		poll();
		// unlike the layout banner this ignores dismissal: whoever opens
		// Settings is asking, and the answer shouldn't hide itself
		checkForUpdate().then((found) => (update = found));
		return () => clearTimeout(pollTimer);
	});

	async function poll() {
		try {
			model = await transport.modelStatus();
		} catch {
			model = { status: 'error', received: 0, total: 0, message: m().settings.engineUnreachable };
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
			window.mtui?.toast(m().settings.transcribingWith(getModel(id).label));
		} catch (e) {
			model = {
				status: 'error',
				received: 0,
				total: 0,
				message: e instanceof Error ? e.message : m().settings.engineUnreachable
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

<svelte:head><title>{m().settings.windowTitle}</title></svelte:head>

<div class="screen-stack">
	<h1 class="t-page">{m().settings.title}</h1>

	<!-- Model ---------------------------------------------------------------->
	<section class="stack" data-gap="8">
		<h2 class="t-card">{m().settings.transcription}</h2>
		{#if selectedModel}
			<ModelPicker
				selected={selectedModel}
				available={model.available ?? []}
				onSelect={chooseModel}
			/>
		{:else}
			<div class="card"><span class="t-secondary">{m().settings.checkingModel}</span></div>
		{/if}

		{#if model.status === 'downloading'}
			<div class="card">
				<Progress
					value={model.total ? model.received / model.total : 0}
					label={m().home.downloadingModel(
						selectedModel ? getModel(selectedModel).label : '…'
					)}
					detail={m().settings.downloadDetail(fmtSize(model.received), fmtSize(model.total))}
					phase="downloading"
				/>
			</div>
		{:else if model.status === 'error'}
			<div class="alert" data-status="danger">
				<span class="icon" data-icon="alert-triangle"></span>
				<div>
					<span class="alert-title">{m().settings.modelUnavailable}</span>
					<p>{model.message ?? m().settings.unknownError}</p>
				</div>
			</div>
		{/if}
	</section>

	<!-- Spoken language ------------------------------------------------------>
	<section class="stack" data-gap="8">
		<h2 class="t-card">{m().settings.spokenLanguage}</h2>
		<div class="card">
			<div class="stack" data-gap="12">
				<!-- keyed: x-select copies the option text into its facade when it
				     mounts, so a language switch has to remount it -->
				{#key locale()}
					<x-select>
						<label class="field">
							<span class="t-label">{m().settings.spokenLanguageLabel}</span>
							<span class="select">
								<select value={language} onchange={(e) => chooseLanguage(e.currentTarget.value)}>
									{#each LANGUAGES as [code] (code)}
										<option value={code}>{languageDisplay(code)}</option>
									{/each}
								</select>
							</span>
						</label>
					</x-select>
				{/key}
				<p class="t-secondary">{m().settings.spokenLanguageHelp}</p>
			</div>
		</div>
	</section>

	<!-- App language ----------------------------------------------------------->
	<section class="stack" data-gap="8">
		<h2 class="t-card">{m().settings.appLanguage}</h2>
		<div class="card">
			<div class="stack" data-gap="12">
				<fieldset class="segmented" style="--seg-count: 3">
					{#each [
						['en', m().settings.appLanguageEnglish],
						['ar', m().settings.appLanguageArabic],
						['system', m().settings.appLanguageSystem]
					] as [value, label] (value)}
						<label>
							<input
								type="radio"
								name="app-language"
								{value}
								checked={uiLanguage === value}
								onchange={() => setAppLanguage(value as AppLanguage)}
							/>
							<span>{label}</span>
						</label>
					{/each}
				</fieldset>
				<p class="t-secondary">{m().settings.appLanguageHelp}</p>
			</div>
		</div>
	</section>

	<!-- Appearance ----------------------------------------------------------->
	<section class="stack" data-gap="8">
		<h2 class="t-card">{m().settings.appearance}</h2>
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
						<span>{m().settings.light}</span>
					</label>
					<label>
						<input
							type="radio"
							name="theme"
							value="dark"
							checked={theme === 'dark'}
							onchange={() => chooseTheme('dark')}
						/>
						<span>{m().settings.dark}</span>
					</label>
					<label>
						<input
							type="radio"
							name="theme"
							value="system"
							checked={theme === 'system'}
							onchange={() => chooseTheme('system')}
						/>
						<span>{m().settings.system}</span>
					</label>
				</fieldset>
				<p class="t-secondary">{m().settings.appearanceHelp}</p>
			</div>
		</div>
	</section>

	<!-- Developer ------------------------------------------------------------>
	<section class="stack" data-gap="8">
		<h2 class="t-card">{m().settings.developer}</h2>
		<div class="card">
			<div class="stack" data-gap="12">
				<p class="t-secondary">{m().settings.developerHelp}</p>
				<div class="row">
					<a class="btn" href="/logs">{m().settings.viewLogs}</a>
				</div>
			</div>
		</div>
	</section>

	<!-- About ---------------------------------------------------------------->
	<section class="stack" data-gap="8">
		<h2 class="t-card">{m().settings.about}</h2>
		<div class="card">
			<div class="stack" data-gap="12">
				<div class="stack" data-gap="4">
					<span class="t-card">{m().appName} <span class="badge t-ltr">v{pkg.version}</span></span>
					<p class="t-secondary">{m().settings.description}</p>
				</div>

				{#if update}
					<div class="alert">
						<span class="icon" data-icon="info"></span>
						<div class="stack" data-gap="8">
							<span class="alert-title">{m().update.available(update.version)}</span>
							<p>{m().update.body}</p>
							<div class="row">
								<a
									class="btn"
									data-variant="primary"
									href={update.url}
									target="_blank"
									rel="noreferrer noopener"
								>
									{m().update.get}
								</a>
							</div>
						</div>
					</div>
				{/if}

				<p class="t-secondary">{m().settings.privacy}</p>

				<div class="row" data-gap="8" data-wrap="on">
					<a
						class="btn"
						href={pkg.homepage}
						target="_blank"
						rel="noreferrer noopener"
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a12 12 0 0 0-3.79 23.4c.6.1.82-.26.82-.58l-.01-2.02c-3.34.73-4.04-1.6-4.04-1.6-.55-1.4-1.34-1.77-1.34-1.77-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22l-.01 3.29c0 .32.21.69.82.57A12 12 0 0 0 12 .5Z"/></svg>
						{m().settings.viewOnGitHub}
					</a>
					<a
						class="btn"
						data-variant="ghost"
						href="{pkg.homepage}/issues"
						target="_blank"
						rel="noreferrer noopener"
					>
						{m().settings.reportIssue}
					</a>
				</div>

				<p class="t-secondary">
					{m().settings.license(pkg.license)}
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
