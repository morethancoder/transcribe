<script lang="ts">
	import 'morethanui/css/tokens.css';
	import 'morethanui/css/base.css';
	import 'morethanui/css/layout.css';
	import 'morethanui/css/components.css';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	let { children } = $props();

	let dark = $state(false);

	onMount(() => {
		dark = document.documentElement.dataset.theme === 'dark';
		// menu.js is required for x-select/.menu popover anchoring, not optional
		import('morethanui/js/menu.js');
		import('morethanui/js/x-select.js');
		import('morethanui/js/x-toast.js');
		import('morethanui/js/accordion.js');
	});

	function toggleTheme() {
		dark = !dark;
		const theme = dark ? 'dark' : 'light';
		document.documentElement.dataset.theme = theme;
		try {
			localStorage.setItem('mtui-theme', theme);
		} catch {
			// private browsing — theme just won't persist
		}
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Transcrape</title>
</svelte:head>

<header class="shell-header">
	<span class="t-card">Transcrape</span>
	<button
		class="btn"
		data-variant="ghost"
		data-size="icon"
		aria-label="Toggle dark mode"
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
		<span>Transcribe</span>
	</a>
	<a href="/history" aria-current={page.url.pathname.startsWith('/history') ? 'page' : undefined}>
		<!-- no clock in the MTUI icon set -->
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>
		<span>History</span>
	</a>
</nav>

<main class="shell-content">
	{@render children()}
</main>
