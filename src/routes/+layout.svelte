<script lang="ts">
	import 'morethanui/css/tokens.css';
	import 'morethanui/css/base.css';
	import 'morethanui/css/layout.css';
	import 'morethanui/css/components.css';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	import { applyTheme, loadTheme, saveTheme, watchSystemTheme } from '$lib/settings';
	import { initI18n, m } from '$lib/i18n.svelte';
	import { installLogCapture } from '$lib/logs';
	import { checkForUpdate, dismiss, isDismissed, type UpdateInfo } from '$lib/update';

	let { children } = $props();

	let dark = $state(false);
	let update = $state<UpdateInfo | null>(null);

	onMount(() => {
		initI18n();
		// First, so a failure anywhere below already lands in the log.
		installLogCapture();
		dark = document.documentElement.dataset.theme === 'dark';
		// menu.js is required for x-select/.menu popover anchoring, not optional
		import('morethanui/js/menu.js');
		import('morethanui/js/x-select.js');
		import('morethanui/js/x-toast.js');
		import('morethanui/js/accordion.js');

		// One release check per session. The banner respects a dismissal until
		// the *next* release — nagging every launch teaches people to stop reading.
		checkForUpdate().then((found) => {
			if (found && !isDismissed(found.version)) update = found;
		});

		// Someone on "System" who changes their OS theme should see this follow.
		return watchSystemTheme(() => {
			applyTheme(loadTheme());
			dark = document.documentElement.dataset.theme === 'dark';
		});
	});

	function dismissUpdate() {
		if (update) dismiss(update.version);
		update = null;
	}

	/**
	 * The header button is a shortcut, not the setting: it flips to the opposite
	 * of what is on screen right now and pins that, which is what someone
	 * reaching for it wants. Choosing "System" again lives in Settings.
	 */
	function toggleTheme() {
		dark = !dark;
		saveTheme(dark ? 'dark' : 'light');
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{m().appName}</title>
</svelte:head>

<header class="shell-header">
	<span class="t-card">{m().appName}</span>
	<button
		class="btn"
		data-variant="ghost"
		data-size="icon"
		aria-label={m().nav.toggleTheme}
		style="margin-inline-start: auto"
		onclick={toggleTheme}
	>
		{#if dark}
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
		{:else}
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
		{/if}
	</button>
</header>

<nav class="shell-nav">
	<a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}>
		<span class="icon" data-icon="home"></span>
		<span>{m().nav.transcribe}</span>
	</a>
	<a href="/history" aria-current={page.url.pathname.startsWith('/history') ? 'page' : undefined}>
		<!-- no clock in the MTUI icon set -->
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>
		<span>{m().nav.history}</span>
	</a>
	<a href="/settings" aria-current={page.url.pathname.startsWith('/settings') ? 'page' : undefined}>
		<span class="icon" data-icon="settings"></span>
		<span>{m().nav.settings}</span>
	</a>
</nav>

<main class="shell-content">
	{#if update}
		<div class="alert update">
			<span class="icon" data-icon="info"></span>
			<div class="stack" data-gap="8">
				<span class="alert-title">{m().update.available(update.version)}</span>
				<p>{m().update.body}</p>
				<div class="row" data-gap="8" data-wrap="on">
					<a class="btn" data-variant="primary" href={update.url} target="_blank" rel="noreferrer noopener">
						{m().update.get}
					</a>
					<button class="btn" data-variant="ghost" onclick={dismissUpdate}>
						{m().update.dismiss}
					</button>
				</div>
			</div>
		</div>
	{/if}
	{@render children()}
</main>

<style>
	/* The banner sits inside the content column, so it scrolls away with the
	   page instead of stealing a permanent strip of a phone screen. */
	.update {
		margin-block-end: var(--sp-16);
	}
</style>
