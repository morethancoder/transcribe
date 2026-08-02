<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Transcript from '$lib/components/Transcript.svelte';
	import { getEntry, removeEntry, type HistoryEntry } from '$lib/history';
	import * as transport from '$lib/transport';
	import { fmtClock, fmtDate, fmtSize } from '$lib/format';
	import { m } from '$lib/i18n.svelte';

	// history lives in localStorage, so there's nothing to show until we're
	// mounted in the browser — null means "still looking"
	let entry = $state<HistoryEntry | null>(null);
	let ready = $state(false);
	let confirmDelete = $state<HTMLDialogElement>();
	/** Server-side audio for this job, when it hasn't expired yet. */
	let mediaSrc = $state<string | null>(null);

	onMount(() => {
		const found = getEntry(page.params.id ?? '') ?? null;
		entry = found;
		ready = true;
		if (!found?.jobId) return;

		// The source file is long gone from the browser and only the decoded
		// audio was kept, so playback here is audio even for a video. Ask before
		// rendering a player: the job expires after a few hours.
		transport.jobAudio(found.jobId).then((url) => (mediaSrc = url));

		// In the app build that URL is a blob, which leaks until it's released.
		return () => transport.revokeAudio(mediaSrc);
	});

	async function onClose() {
		if (confirmDelete?.returnValue !== 'confirm' || !entry) return;
		removeEntry(entry.id);
		await goto('/history');
		window.mtui?.toast(m().history.deleted);
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
			<span class="t-card">{m().history.notFound}</span>
			<p class="t-secondary">{m().history.notFoundHelp}</p>
			<a class="btn" data-variant="primary" href="/history">{m().history.back}</a>
		</div>
	{:else}
		<div class="row" data-gap="12" data-align="start">
			{#if entry.thumbnail}
				<img class="thumb" src={entry.thumbnail} alt="" />
			{/if}
			<div class="stack" data-gap="4">
				<h1 class="t-page t-ltr name">{entry.name}</h1>
				<p class="t-secondary">
					{fmtDate(entry.createdAt)} · {fmtSize(entry.size)}{entry.durationMs
						? ` · ${fmtClock(entry.durationMs)}`
						: ''}
				</p>
			</div>
		</div>

		<Transcript bind:entry={() => entry!, (v) => (entry = v)} {mediaSrc} mediaKind="audio" />

		{#if !mediaSrc}
			<p class="t-secondary">{m().history.noPlayback}</p>
		{/if}

		<button class="btn" data-variant="ghost" onclick={() => confirmDelete?.showModal()}>
			{m().history.deleteTranscript}
		</button>
	{/if}
</div>

<dialog class="dialog" bind:this={confirmDelete} onclose={onClose}>
	<form method="dialog" class="stack" data-gap="12">
		<span class="t-card">{m().history.deleteConfirm}</span>
		<p class="t-secondary">{m().history.deleteConfirmHelp}</p>
		<div class="row" data-gap="8" data-align="between">
			<button class="btn" value="cancel">{m().history.cancel}</button>
			<button class="btn" data-variant="danger" value="confirm">{m().history.deleteAction}</button>
		</div>
	</form>
</dialog>

<style>
	/* A filename is a long unbroken identifier, not a headline. At t-page's 38px
	   a real one wrapped to four lines and ate a third of a phone screen, so step
	   down to the section size, and allow mid-token breaks for names that carry
	   no spaces or hyphens to break at.

	   Two conditions, because a phone constrains a different axis depending on
	   how it is held: narrow in portrait, but short in landscape — 844x390, wide
	   enough to clear any width query while leaving almost no room to read. */
	.name {
		overflow-wrap: anywhere;
	}

	@media (max-width: 599.98px), (max-height: 480px) {
		.name {
			font-size: var(--fs-section);
			line-height: var(--lh-section);
			letter-spacing: var(--ls-section);
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
