<script lang="ts">
	import { MODELS, SUGGESTED, getModel, looksLikePhone, type ModelId } from '$lib/models';
	import { fmtSize } from '$lib/format';

	type Props = {
		selected: ModelId;
		/** Models already on disk, so switching to one is instant. */
		available?: ModelId[];
		onSelect: (id: ModelId) => void;
	};

	let { selected, available = [], onSelect }: Props = $props();

	// Resolved once on the client: the suggestion depends on the device, and on
	// the server there is no device to ask about.
	let phone = $state(false);
	$effect(() => {
		phone = looksLikePhone();
	});

	let suggested = $derived(phone ? SUGGESTED.phone : SUGGESTED.desktop);
	let current = $derived(getModel(selected));
</script>

<details class="accordion">
	<summary>Transcription model — {current.label} ({fmtSize(current.bytes)})</summary>
	<div class="accordion-body">
		<div class="stack" data-gap="12">
			<p class="t-secondary">
				Bigger models hear better and take longer. The suggestion below is only a starting
				point — every model is available on every device, so if you want the most accurate
				one on a phone, take it.
			</p>

			{#each MODELS as model (model.id)}
				<label class="choice">
					<input
						type="radio"
						name="transcription-model"
						value={model.id}
						checked={model.id === selected}
						onchange={() => onSelect(model.id)}
					/>
					<span class="choice-body">
						<span class="choice-head">
							<span class="t-card">{model.label}</span>
							<span class="badge">{fmtSize(model.bytes)}</span>
							{#if model.id === suggested}
								<span class="badge" data-status="success">
									Suggested for {phone ? 'phones' : 'desktop'}
								</span>
							{/if}
							{#if available.includes(model.id)}
								<span class="badge">Downloaded</span>
							{/if}
							{#if !model.translates}
								<span class="badge" data-status="warning">Can't translate</span>
							{/if}
						</span>
						<span class="t-secondary">{model.blurb}</span>
					</span>
				</label>
			{/each}

			<p class="t-secondary">
				Switching models downloads the new one the first time you use it. The old one stays
				on disk, so switching back is instant.
			</p>
		</div>
	</div>
</details>

<style>
	/* A whole row is the target, not just the dot — this list gets used on a
	   phone, where a 20px radio is a miss waiting to happen. */
	.choice {
		display: flex;
		align-items: start;
		gap: var(--sp-12);
		padding: var(--sp-12);
		border-radius: var(--r-input);
		background: var(--surface-2);
		cursor: pointer;
		transition: background-color var(--t-micro) var(--ease);
	}

	.choice:hover {
		background: var(--surface-3);
	}

	/* MTUI has no radio-list component, so the input keeps its native look and
	   only the row around it is styled. */
	.choice input {
		flex: 0 0 auto;
		margin-block-start: 0.2em;
		accent-color: var(--accent);
		inline-size: 1.15rem;
		block-size: 1.15rem;
	}

	.choice:has(input:checked) {
		background: var(--accent-tint);
		color: var(--accent-text);
	}

	.choice:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.choice-body {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		min-inline-size: 0;
	}

	.choice-head {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-8);
	}
</style>
