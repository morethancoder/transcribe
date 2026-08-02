<script lang="ts">
	import { MESSAGE_INTERVAL_MS, progressMessages } from '$lib/progress-messages';
	import type { Phase } from '$lib/types';

	let {
		value = 0,
		label = '',
		detail = '',
		phase = null
	}: { value?: number; label?: string; detail?: string; phase?: Phase | null } = $props();

	let percent = $derived(Math.round(Math.min(1, Math.max(0, value)) * 100));

	let messages = $derived(phase ? progressMessages(phase) : []);
	let tick = $state(0);

	/**
	 * Cycle the reassurance line. Restarting from the first message whenever the
	 * phase changes means a new phase always announces itself, rather than
	 * picking up mid-rotation with something that reads as stale.
	 */
	$effect(() => {
		if (!messages.length) return;
		tick = 0;
		const timer = setInterval(() => (tick += 1), MESSAGE_INTERVAL_MS);
		return () => clearInterval(timer);
	});

	let message = $derived(messages.length ? messages[tick % messages.length] : '');
</script>

<div class="stack" data-gap="8">
	<div class="row" data-align="between" data-gap="12">
		<span class="t-row">{label}</span>
		<span class="t-label t-ltr">{percent}%</span>
	</div>
	<div
		class="progress"
		role="progressbar"
		aria-label={label}
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={percent}
	>
		<span class="progress-fill" style:inline-size="{percent}%"></span>
	</div>

	<!-- The ETA is the useful half and gets the live region; the rotating line
	     is decoration, and announcing it every four seconds would make a screen
	     reader unusable. -->
	{#if detail}
		<span class="t-secondary" aria-live="polite">{detail}</span>
	{/if}
	{#if message}
		<span class="t-secondary message" aria-hidden="true">{message}</span>
	{/if}
</div>

<style>
	/* MTUI ships no progress bar; built from its tokens so it themes with the rest. */
	.progress {
		position: relative;
		block-size: var(--sp-8);
		background: var(--surface-2);
		border-radius: var(--r-chip);
		overflow: hidden;
	}

	.progress-fill {
		position: relative;
		display: block;
		block-size: 100%;
		background: var(--accent);
		border-radius: inherit;
		overflow: hidden;
		transition: inline-size var(--t-micro) var(--ease);
	}

	/* A highlight travelling along the filled part, so the bar reads as working
	   even while the percentage sits still — whisper only reports every 5%. It
	   rides inside the fill, so it never suggests progress that hasn't happened. */
	.progress-fill::after {
		content: '';
		position: absolute;
		inset-block: 0;
		inline-size: 40%;
		background: linear-gradient(
			90deg,
			transparent 0%,
			rgb(255 255 255 / 0.45) 50%,
			transparent 100%
		);
		animation: sheen 1.8s var(--ease) infinite;
	}

	@keyframes sheen {
		from {
			transform: translateX(-100%);
		}
		to {
			/* 250% of a 40%-wide highlight clears the full width, plus its own. */
			transform: translateX(250%);
		}
	}

	.message {
		/* Fade each line in so a swap registers as a change without moving the
		   layout — every message occupies the same row. */
		animation: fade-in var(--t-micro) var(--ease);
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.progress-fill {
			transition: none;
		}

		/* No travelling highlight and no fade: the text still rotates, which is
		   the part that carries the information. */
		.progress-fill::after {
			animation: none;
			opacity: 0;
		}

		.message {
			animation: none;
		}
	}
</style>
