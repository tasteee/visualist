<script lang="ts">
	import { applyPendingBpm, app, dismissPendingBpm } from '../store.svelte'
	import { formatBpm } from '../engine/timeline'
	import { focusShell } from './focus'

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

<z-dialog isOpen={pending !== null} heading="This song sounds like {detectedLabel} BPM" description="Tempo" onclose={handleKeep}>
	<p>The project is at {currentLabel} BPM. Use the song's tempo for the grid and the beat lines? You can change it any time in Settings.</p>

	<div slot="footer">
		<z-button size="md" kind="ghost" tone="neutral" onclick={handleKeep}>Keep {currentLabel}</z-button>
		<z-button size="md" kind="solid" tone="primary" onclick={handleApply}>Use {detectedLabel} BPM</z-button>
	</div>
</z-dialog>
