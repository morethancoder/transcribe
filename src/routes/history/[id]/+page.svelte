<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Transcript from '$lib/components/Transcript.svelte';
	import { getEntry, removeEntry, type HistoryEntry } from '$lib/history';
	import { fmtClock, fmtDate, fmtSize } from '$lib/format';

	// history lives in localStorage, so there's nothing to show until we're
	// mounted in the browser — null means "still looking"
	let entry = $state<HistoryEntry | null>(null);
	let ready = $state(false);
	let confirmDelete = $state<HTMLDialogElement>();
	/** Server-side audio for this job, when it hasn't expired yet. */
	let mediaSrc = $state<string | null>(null);

	onMount(async () => {
		const found = getEntry(page.params.id ?? '') ?? null;
		entry = found;
		ready = true;
		if (!found?.jobId) return;

		// The source file is long gone from the browser and the server only kept
		// the decoded audio, so playback here is audio even for a video. Ask
		// before rendering a player: the job expires after a few hours.
		const url = `/api/audio?job=${encodeURIComponent(found.jobId)}`;
		try {
			const res = await fetch(url, { method: 'HEAD' });
			if (res.ok) mediaSrc = url;
		} catch {
			mediaSrc = null;
		}
	});

	async function onClose() {
		if (confirmDelete?.returnValue !== 'confirm' || !entry) return;
		removeEntry(entry.id);
		await goto('/history');
		window.mtui?.toast('Transcript deleted');
	}
</script>

<div class="screen-stack">
	{#if !ready}
		<div class="card">
			<div class="stack" data-gap="8">
				<span class="skeleton" data-shape="title"></span>
				<span class="skeleton" data-shape="text"></span>
				<span class="skeleton" data-shape="text"></span>
			</div>
		</div>
	{:else if !entry}
		<div class="empty">
			<span class="empty-icon"><span class="icon" data-icon="circle-x"></span></span>
			<span class="t-card">Transcript not found</span>
			<p class="t-secondary">It may have been deleted or saved in another browser.</p>
			<a class="btn" data-variant="primary" href="/history">Back to history</a>
		</div>
	{:else}
		<div class="row" data-gap="12" data-align="start">
			{#if entry.thumbnail}
				<img class="thumb" src={entry.thumbnail} alt="" />
			{/if}
			<div class="stack" data-gap="4">
				<h1 class="t-page t-ltr">{entry.name}</h1>
				<p class="t-secondary">
					{fmtDate(entry.createdAt)} · {fmtSize(entry.size)}{entry.durationMs
						? ` · ${fmtClock(entry.durationMs)}`
						: ''}
				</p>
			</div>
		</div>

		<Transcript bind:entry={() => entry!, (v) => (entry = v)} {mediaSrc} mediaKind="audio" />

		{#if !mediaSrc}
			<p class="t-secondary">
				Playback isn't available — the server only keeps the audio for a few hours after
				transcribing. The transcript is still fully editable.
			</p>
		{/if}

		<button class="btn" data-variant="ghost" onclick={() => confirmDelete?.showModal()}>
			Delete transcript
		</button>
	{/if}
</div>

<dialog class="dialog" bind:this={confirmDelete} onclose={onClose}>
	<form method="dialog" class="stack" data-gap="12">
		<span class="t-card">Delete this transcript?</span>
		<p class="t-secondary">This can't be undone.</p>
		<div class="row" data-gap="8" data-align="between">
			<button class="btn" value="cancel">Cancel</button>
			<button class="btn" data-variant="danger" value="confirm">Delete</button>
		</div>
	</form>
</dialog>

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
