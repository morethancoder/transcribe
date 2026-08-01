<script lang="ts">
	import { onMount } from 'svelte';
	import { clearHistory, loadHistory, type HistoryEntry } from '$lib/history';
	import { fmtClock, fmtDate, languageName } from '$lib/format';

	let entries = $state<HistoryEntry[] | null>(null);
	let confirmClear = $state<HTMLDialogElement>();

	onMount(() => {
		entries = loadHistory();
	});

	function onClose() {
		if (confirmClear?.returnValue !== 'confirm') return;
		clearHistory();
		entries = [];
		window.mtui?.toast('History cleared');
	}
</script>

<div class="screen-stack">
	<div class="row" data-align="between" data-wrap="on">
		<h1 class="t-page">History</h1>
		{#if entries?.length}
			<button class="btn" data-variant="ghost" onclick={() => confirmClear?.showModal()}>
				Clear history
			</button>
		{/if}
	</div>

	{#if entries === null}
		<div class="card">
			<div class="stack" data-gap="8">
				<span class="skeleton" data-shape="row"></span>
				<span class="skeleton" data-shape="row"></span>
			</div>
		</div>
	{:else if entries.length === 0}
		<div class="empty">
			<span class="empty-icon">
				<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>
			</span>
			<span class="t-card">No transcripts yet</span>
			<p class="t-secondary">Everything you transcribe is kept here, on this device.</p>
			<a class="btn" data-variant="primary" href="/">Transcribe a file</a>
		</div>
	{:else}
		<div class="card">
			{#each entries as item (item.id)}
				<a class="item" href="/history/{item.id}">
					{#if item.thumbnail}
						<img class="thumb" src={item.thumbnail} alt="" />
					{/if}
					<span class="item-text">
						<span class="item-title t-ltr">{item.name}</span>
						<span class="item-sub">
							{fmtDate(item.createdAt)}{item.durationMs ? ` · ${fmtClock(item.durationMs)}` : ''}
						</span>
					</span>
					<span class="item-meta">
						<span class="badge">{languageName(item.language)}</span>
						{#if item.translation}<span class="badge" data-status="success">EN</span>{/if}
					</span>
					<svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
				</a>
			{/each}
		</div>
	{/if}
</div>

<dialog class="dialog" bind:this={confirmClear} onclose={onClose}>
	<form method="dialog" class="stack" data-gap="12">
		<span class="t-card">Clear all history?</span>
		<p class="t-secondary">Every saved transcript on this device is removed. This can't be undone.</p>
		<div class="row" data-gap="8" data-align="between">
			<button class="btn" value="cancel">Cancel</button>
			<button class="btn" data-variant="danger" value="confirm">Clear</button>
		</div>
	</form>
</dialog>

<style>
	.thumb {
		flex: 0 0 auto;
		inline-size: var(--sp-40);
		block-size: var(--sp-40);
		object-fit: cover;
		border-radius: var(--r-input);
		background: var(--surface-2);
	}
</style>
