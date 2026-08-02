<script lang="ts">
	import { onMount } from 'svelte';
	import { clearFrontendLogs, frontendLogs } from '$lib/logs';
	import { locale, m } from '$lib/i18n.svelte';
	import * as transport from '$lib/transport';
	import type { LogEntry } from '$lib/transport';

	let entries = $state<LogEntry[]>([]);
	let loaded = $state(false);
	let pollTimer: ReturnType<typeof setTimeout> | undefined;

	const app = transport.isApp();

	// Log content is technical English either way; only the timestamps localise.
	let timeFmt = $derived(
		new Intl.DateTimeFormat(locale(), {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		})
	);

	onMount(() => {
		void refresh();
		return () => clearTimeout(pollTimer);
	});

	/** The engine appends while downloads and runs are going — follow along. */
	async function refresh() {
		// In the app every frontend entry was forwarded to the engine's buffer,
		// so that buffer alone is the whole story; the web build only has what
		// this webview captured itself.
		entries = app ? await transport.engineLogs().catch(() => entries) : frontendLogs();
		loaded = true;
		clearTimeout(pollTimer);
		pollTimer = setTimeout(refresh, 2000);
	}

	function asText(): string {
		return entries
			.map(
				(e) =>
					`${new Date(e.atMs).toISOString()} ${e.level.toUpperCase().padEnd(5)} [${e.source}] ${e.message}`
			)
			.join('\n');
	}

	async function copy() {
		await navigator.clipboard.writeText(asText());
		window.mtui?.toast(m().logs.copied);
	}

	async function clear() {
		await transport.clearEngineLogs().catch(() => {});
		clearFrontendLogs();
		entries = [];
		window.mtui?.toast(m().logs.cleared);
	}
</script>

<svelte:head><title>{m().logs.windowTitle}</title></svelte:head>

<div class="screen-stack">
	<div class="row" data-align="between" data-gap="12" data-wrap="on">
		<h1 class="t-page">{m().logs.title}</h1>
		<div class="row" data-gap="8">
			<button class="btn" onclick={copy} disabled={!entries.length}>{m().logs.copy}</button>
			<button class="btn" data-variant="ghost" onclick={clear} disabled={!entries.length}>
				{m().logs.clear}
			</button>
		</div>
	</div>

	{#if !app}
		<p class="t-secondary">{m().logs.webNote}</p>
	{/if}

	{#if loaded && !entries.length}
		<div class="card">
			<div class="stack" data-gap="4">
				<span class="t-card">{m().logs.empty}</span>
				<p class="t-secondary">{m().logs.emptyHelp}</p>
			</div>
		</div>
	{:else if entries.length}
		<div class="card log" dir="ltr">
			{#each entries as entry, i (i)}
				<div class="entry">
					<span class="t-label time">{timeFmt.format(new Date(entry.atMs))}</span>
					{#if entry.level === 'error'}
						<span class="badge" data-status="danger">{entry.level}</span>
					{:else if entry.level === 'warn'}
						<span class="badge" data-status="warning">{entry.level}</span>
					{:else}
						<span class="badge">{entry.level}</span>
					{/if}
					<span class="t-label">[{entry.source}]</span>
					<span class="message">{entry.message}</span>
				</div>
			{/each}
		</div>
	{/if}

	<div class="row">
		<a class="btn" data-variant="ghost" href="/settings">{m().logs.back}</a>
	</div>
</div>

<style>
	/* One column of entries, newest at the bottom the way logs read. LTR even
	   in Arabic: the content is technical English from the engine. */
	.log {
		display: flex;
		flex-direction: column;
		gap: var(--sp-8);
		max-block-size: 60vh;
		overflow-y: auto;
	}

	.entry {
		display: flex;
		align-items: baseline;
		gap: var(--sp-8);
		flex-wrap: wrap;
	}

	.time {
		font-variant-numeric: tabular-nums;
	}

	.message {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.85em;
		overflow-wrap: anywhere;
		flex: 1 1 100%;
	}
</style>
