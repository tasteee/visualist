<script lang="ts">
	import ArrowsOutLineHorizontalIcon from 'phosphor-svelte/lib/ArrowsOutLineHorizontalIcon'
	import MusicNotesIcon from 'phosphor-svelte/lib/MusicNotesIcon'
	import { formatBarBeat, formatBpm, formatPreciseTime } from '../engine/timeline'
	import { app, getAnalysis } from '../store.svelte'
	import { checkIsFitted, fitView, getZoomLevel } from '../timeline.svelte'
	import { openAudioPicker } from './filePicker'
	import { press } from './press'
	import './TransportBar.css'

	// The readout above the timeline. The buttons that act on the
	// timeline live in the toolbar beside the editor.
	const canAddAudio = $derived(!app.isRecording)

	const elapsedLabel = $derived(formatPreciseTime(app.currentTime))
	const totalLabel = $derived(formatPreciseTime(app.duration))
	const barBeatLabel = $derived(formatBarBeat(app.currentTime, getAnalysis().bpm, getAnalysis().beatOffset))
	const bpmLabel = $derived(formatBpm(getAnalysis().bpm))

	const zoomLevel = $derived(getZoomLevel())
	const zoomLabel = $derived(zoomLevel < 1.05 ? 'Fit' : `${zoomLevel.toFixed(1)}×`)
	const isFitted = $derived(checkIsFitted())
</script>

<div class="transport-bar">
	<div class="transport-bar-readout" aria-live="off">
		<div class="transport-bar-cell isWide">
			<span class="transport-bar-eyebrow">Time</span>
			<span class="transport-bar-figure">
				{elapsedLabel}<span class="transport-bar-total">&nbsp;/ {totalLabel}</span>
			</span>
		</div>
		<div class="transport-bar-cell">
			<span class="transport-bar-eyebrow">Bar</span>
			<span class="transport-bar-figure">{barBeatLabel}</span>
		</div>
		<div class="transport-bar-cell">
			<span class="transport-bar-eyebrow">BPM</span>
			<span class="transport-bar-figure">{bpmLabel}</span>
		</div>
	</div>

	<div class="transport-bar-spacer"></div>

	<div class="transport-bar-zoom">
		<span class="transport-bar-zoom-level">{zoomLabel}</span>
		<z-tooltip content="Zoom to fit (0)" placement="top">
			<button class="transport-bar-icon" type="button" disabled={isFitted} aria-label="Zoom to fit" {...press(fitView)}>
				<ArrowsOutLineHorizontalIcon weight="bold" />
			</button>
		</z-tooltip>
	</div>

	<span class="transport-bar-divider"></span>

	<z-button size="sm" kind="ghost" tone="neutral" isDisabled={!canAddAudio} onclick={openAudioPicker}>
		<MusicNotesIcon weight="bold" />
		Add audio
	</z-button>
</div>
