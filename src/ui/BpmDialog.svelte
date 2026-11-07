<script lang="ts">
	import { applyPendingBpm, app, dismissPendingBpm } from '../store.svelte'
	import { formatBpm } from '../engine/timeline'
	import { focusShell } from './focus'
	import './BpmDialog.css'

	// Asked once for a song's tempo, when it loads: should the
	// project take the tempo that was found in it?
	const pending = $derived(app.pendingBpm)
	const detectedLabel = $derived(pending === null ? '' : formatBpm(pending))
	const currentLabel = $derived(formatBpm(app.bpm))

	const handleApply = () => {
		applyPendingBpm()
		focusShell()
	}

	const handleKeep = () => {
		dismissPendingBpm()
		focusShell()
	}
</script>

{#if pending !== null}
	<div class="bpm-dialog-backdrop" role="presentation">
		<div class="bpm-dialog" role="dialog" aria-modal="true" aria-labelledby="bpm-dialog-title">
			<span class="bpm-dialog-eyebrow">Tempo</span>
			<h2 class="bpm-dialog-title" id="bpm-dialog-title">This song sounds like {detectedLabel} BPM</h2>
			<p class="bpm-dialog-text">The project is at {currentLabel} BPM. Use the song's tempo for the grid and the beat lines? You can change it any time in Settings.</p>
			<div class="bpm-dialog-actions">
				<button class="bpm-dialog-button" type="button" onclick={handleKeep}>Keep {currentLabel}</button>
				<button class="bpm-dialog-button isPrimary" type="button" onclick={handleApply}>Use {detectedLabel} BPM</button>
			</div>
		</div>
	</div>
{/if}
