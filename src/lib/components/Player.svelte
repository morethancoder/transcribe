<script lang="ts">
	type Props = {
		src: string;
		kind: 'video' | 'audio';
		poster?: string | null;
		/** Playhead in seconds — two-way, so setting it seeks. */
		currentTime?: number;
		paused?: boolean;
	};

	let {
		src,
		kind,
		poster = null,
		currentTime = $bindable(0),
		paused = $bindable(true)
	}: Props = $props();
</script>

{#if kind === 'video'}
	<!-- svelte-ignore a11y_media_has_caption -- the transcript below IS the caption -->
	<video
		class="player"
		{src}
		poster={poster ?? undefined}
		controls
		preload="metadata"
		bind:currentTime
		bind:paused
	></video>
{:else}
	<audio class="player" {src} controls preload="metadata" bind:currentTime bind:paused></audio>
{/if}

<style>
	.player {
		inline-size: 100%;
		display: block;
		border-radius: var(--r-input);
		background: var(--surface-2);
	}

	video.player {
		/* keep a tall portrait clip from pushing the transcript off-screen */
		max-block-size: 60vh;
		object-fit: contain;
	}
</style>
