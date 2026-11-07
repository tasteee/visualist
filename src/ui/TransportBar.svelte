<script lang="ts">
	import ArrowUUpLeftIcon from 'phosphor-svelte/lib/ArrowUUpLeftIcon'
	import ArrowUUpRightIcon from 'phosphor-svelte/lib/ArrowUUpRightIcon'
	import ArrowsOutLineHorizontalIcon from 'phosphor-svelte/lib/ArrowsOutLineHorizontalIcon'
	import CrosshairSimpleIcon from 'phosphor-svelte/lib/CrosshairSimpleIcon'
	import MagnetStraightIcon from 'phosphor-svelte/lib/MagnetStraightIcon'
	import MagnifyingGlassMinusIcon from 'phosphor-svelte/lib/MagnifyingGlassMinusIcon'
	import MagnifyingGlassPlusIcon from 'phosphor-svelte/lib/MagnifyingGlassPlusIcon'
	import MusicNotesIcon from 'phosphor-svelte/lib/MusicNotesIcon'
	import PauseIcon from 'phosphor-svelte/lib/PauseIcon'
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon'
	import RepeatIcon from 'phosphor-svelte/lib/RepeatIcon'
	import SkipBackIcon from 'phosphor-svelte/lib/SkipBackIcon'
	import { automation, redo, undo } from '../automation.svelte'
	import { formatBarBeat, formatBpm, formatPreciseTime } from '../engine/timeline'
	import { app, getAnalysis, goToBeginning, toggleLoop, togglePlay } from '../store.svelte'
	import { checkIsFitted, fitView, getZoomLevel, timeline, toggleFollowing, toggleSnapping, zoomIn, zoomOut } from '../timeline.svelte'
	import { openAudioPicker } from './filePicker'
	import { press } from './press'
	import './TransportBar.css'

	const canPlay = $derived(app.hasAudio && !app.isRecording && !app.isAnalyzing)
	const canChangeSong = $derived(!app.isRecording && !app.isAnalyzing)
	const playLabel = $derived(app.isPlaying ? 'Pause (Space)' : 'Play (Space)')

	const elapsedLabel = $derived(formatPreciseTime(app.currentTime))
	const totalLabel = $derived(formatPreciseTime(app.duration))
	const barBeatLabel = $derived(formatBarBeat(app.currentTime, getAnalysis().bpm, getAnalysis().beatOffset))
	const bpmLabel = $derived(formatBpm(getAnalysis().bpm))

	const zoomLevel = $derived(getZoomLevel())
	const zoomLabel = $derived(zoomLevel < 1.05 ? 'Fit' : `${zoomLevel.toFixed(1)}×`)
	const isFitted = $derived(checkIsFitted())
	const canUndo = $derived(automation.undoDepth > 0)
	const canRedo = $derived(automation.redoDepth > 0)

	const followLabel = $derived(timeline.isFollowing ? 'Following playhead (F)' : 'Follow playhead (F)')
	const snapLabel = $derived(timeline.isSnapping ? 'Snapping to beat grid (S) · hold Shift to move freely' : 'Snap to beat grid (S)')

	const loopLabel = $derived(app.isLoopEnabled ? 'Loop on (L)' : 'Loop off (L)')
	const canLoop = $derived(canPlay)
</script>

<div class="transport-bar">
	<div class="transport-bar-group">
		<z-tooltip content="Go to beginning (Home)" placement="top">
			<button class="transport-bar-icon" type="button" disabled={!canPlay} aria-label="Go to beginning" {...press(goToBeginning)}>
				<SkipBackIcon weight="fill" />
			</button>
		</z-tooltip>
		<z-tooltip content={playLabel} placement="top">
			<button class="transport-bar-play" class:isPlaying={app.isPlaying} type="button" disabled={!canPlay} aria-label={playLabel} {...press(togglePlay)}>
				{#if app.isPlaying}
					<PauseIcon weight="fill" />
				{:else}
					<PlayIcon weight="fill" />
				{/if}
			</button>
		</z-tooltip>
		<z-tooltip content={loopLabel} placement="top">
			<button class="transport-bar-icon" class:isPressed={app.isLoopEnabled} type="button" disabled={!canLoop} aria-pressed={app.isLoopEnabled} aria-label="Loop" {...press(toggleLoop)}>
				<RepeatIcon weight="bold" />
			</button>
		</z-tooltip>
	</div>

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

	<div class="transport-bar-group">
		<z-tooltip content="Undo (⌘Z)" placement="top">
			<button class="transport-bar-icon" type="button" disabled={!canUndo} aria-label="Undo" {...press(undo)}>
				<ArrowUUpLeftIcon weight="bold" />
			</button>
		</z-tooltip>
		<z-tooltip content="Redo (⇧⌘Z)" placement="top">
			<button class="transport-bar-icon" type="button" disabled={!canRedo} aria-label="Redo" {...press(redo)}>
				<ArrowUUpRightIcon weight="bold" />
			</button>
		</z-tooltip>
	</div>

	<span class="transport-bar-divider"></span>

	<div class="transport-bar-group">
		<z-tooltip content={followLabel} placement="top">
			<button class="transport-bar-icon" class:isPressed={timeline.isFollowing} type="button" aria-pressed={timeline.isFollowing} aria-label="Follow playhead" {...press(toggleFollowing)}>
				<CrosshairSimpleIcon weight="bold" />
			</button>
		</z-tooltip>
		<z-tooltip content={snapLabel} placement="top">
			<button class="transport-bar-icon" class:isPressed={timeline.isSnapping} type="button" aria-pressed={timeline.isSnapping} aria-label="Snap to grid" {...press(toggleSnapping)}>
				<MagnetStraightIcon weight="bold" />
			</button>
		</z-tooltip>
	</div>

	<span class="transport-bar-divider"></span>

	<div class="transport-bar-zoom">
		<z-tooltip content="Zoom out (−)" placement="top">
			<button class="transport-bar-icon" type="button" disabled={isFitted} aria-label="Zoom out" {...press(zoomOut)}>
				<MagnifyingGlassMinusIcon weight="bold" />
			</button>
		</z-tooltip>
		<span class="transport-bar-zoom-level">{zoomLabel}</span>
		<z-tooltip content="Zoom in (=)" placement="top">
			<button class="transport-bar-icon" type="button" aria-label="Zoom in" {...press(zoomIn)}>
				<MagnifyingGlassPlusIcon weight="bold" />
			</button>
		</z-tooltip>
		<z-tooltip content="Zoom to fit (0)" placement="top">
			<button class="transport-bar-icon" type="button" disabled={isFitted} aria-label="Zoom to fit" {...press(fitView)}>
				<ArrowsOutLineHorizontalIcon weight="bold" />
			</button>
		</z-tooltip>
	</div>

	<span class="transport-bar-divider"></span>

	<z-button size="sm" kind="ghost" tone="neutral" isDisabled={!canChangeSong} onclick={openAudioPicker}>
		<MusicNotesIcon weight="bold" />
		Change song
	</z-button>
</div>
