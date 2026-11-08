<script lang="ts">
	import ArrowsOutLineHorizontalIcon from 'phosphor-svelte/lib/ArrowsOutLineHorizontalIcon'
	import MetronomeIcon from 'phosphor-svelte/lib/MetronomeIcon'
	import MusicNotesIcon from 'phosphor-svelte/lib/MusicNotesIcon'
	import { formatBarBeat, formatBpm, formatPreciseTime } from '../engine/timeline'
	import { app, getAnalysis, setBpm, toggleMetronome } from '../store.svelte'
	import { checkIsFitted, fitView, getZoomLevel, setEditorMode, timeline } from '../timeline.svelte'
	import type { EditorModeT } from '../timeline.svelte'
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

	let modes = $state<HTMLElement | undefined>()

	const handleBpmInput = (event: Event) => {
		const target = event.currentTarget as HTMLInputElement
		const parsed = Number(target.value)
		if (Number.isFinite(parsed)) setBpm(parsed)
	}

	const handleModeChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value?: string | string[] }>).detail
		const value = Array.isArray(detail.value) ? detail.value[0] : detail.value
		if (value === 'staging' || value === 'modulation') return setEditorMode(value as EditorModeT)
		// A toggle group lets the pressed item be released. A mode always stays on.
		const items = modes?.querySelectorAll<HTMLElement & { value?: string; isPressed?: boolean }>('z-toggle-button-group-item') ?? []
		for (const item of items) item.isPressed = item.value === timeline.mode
	}
</script>

<div class="transport-bar">
	<z-toggle-button-group bind:this={modes} class="transport-bar-modes" name="editor-mode" size="sm" kind="soft" aria-label="Editor mode" onchange={handleModeChange}>
		<z-toggle-button-group-item value="staging" isPressed={timeline.mode === 'staging'}>Staging</z-toggle-button-group-item>
		<z-toggle-button-group-item value="modulation" isPressed={timeline.mode === 'modulation'}>Modulation</z-toggle-button-group-item>
	</z-toggle-button-group>

	<span class="transport-bar-divider"></span>

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
		<label class="transport-bar-cell isBpm" title="Project BPM — click or use Up/Down arrows to adjust">
			<span class="transport-bar-eyebrow">BPM</span>
			<input
				class="transport-bar-bpm-input"
				type="number"
				min="40"
				max="240"
				step="1"
				value={bpmLabel}
				aria-label="Project BPM"
				oninput={handleBpmInput}
				onchange={handleBpmInput}
			/>
		</label>
	</div>

	<z-tooltip content={app.isMetronomeEnabled ? 'Metronome on (M) — clicks on every beat' : 'Metronome off (M) — click to hear beats'} placement="bottom">
		<z-button
			isIcon
			size="sm"
			kind={app.isMetronomeEnabled ? 'soft' : 'ghost'}
			tone={app.isMetronomeEnabled ? 'primary' : 'neutral'}
			aria-pressed={app.isMetronomeEnabled}
			aria-label="Metronome"
			{...press(toggleMetronome)}
		>
			<MetronomeIcon weight="bold" />
		</z-button>
	</z-tooltip>
</div>
