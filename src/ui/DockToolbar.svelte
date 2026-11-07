<script lang="ts">
	import ArrowUUpLeftIcon from 'phosphor-svelte/lib/ArrowUUpLeftIcon'
	import ArrowUUpRightIcon from 'phosphor-svelte/lib/ArrowUUpRightIcon'
	import CaretDoubleDownIcon from 'phosphor-svelte/lib/CaretDoubleDownIcon'
	import CaretDoubleUpIcon from 'phosphor-svelte/lib/CaretDoubleUpIcon'
	import CrosshairSimpleIcon from 'phosphor-svelte/lib/CrosshairSimpleIcon'
	import MagnetStraightIcon from 'phosphor-svelte/lib/MagnetStraightIcon'
	import MagnifyingGlassMinusIcon from 'phosphor-svelte/lib/MagnifyingGlassMinusIcon'
	import MagnifyingGlassPlusIcon from 'phosphor-svelte/lib/MagnifyingGlassPlusIcon'
	import PauseIcon from 'phosphor-svelte/lib/PauseIcon'
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon'
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon'
	import RepeatIcon from 'phosphor-svelte/lib/RepeatIcon'
	import SkipBackIcon from 'phosphor-svelte/lib/SkipBackIcon'
	import { automation, redo, undo } from '../automation.svelte'
	import { app, goToBeginning, toggleLoop, togglePlay } from '../store.svelte'
	import { checkIsFitted, timeline, toggleFollowing, toggleSnapping, zoomIn, zoomOut } from '../timeline.svelte'
	import { openAddLayerMenu } from '../timelineMenus.svelte'
	import { toggleDockFolded, uiState } from '../uiState.svelte'
	import { press } from './press'
	import './DockToolbar.css'

	// The buttons that drive the editor, in a column beside it. The
	// fold button tucks the editor away and leaves only this column.
	const canPlay = $derived(app.hasAudio && !app.isRecording && !app.isAnalyzing)
	const isFolded = $derived(uiState.isDockFolded)
	const isFitted = $derived(checkIsFitted())
	const canUndo = $derived(automation.undoDepth > 0)
	const canRedo = $derived(automation.redoDepth > 0)

	const playLabel = $derived(app.isPlaying ? 'Pause (Space)' : 'Play (Space)')
	const loopLabel = $derived(app.isLoopEnabled ? 'Loop on (L)' : 'Loop off (L)')
	const foldLabel = $derived(isFolded ? 'Show the editor' : 'Fold the editor away')
	const followLabel = $derived(timeline.isFollowing ? 'Following playhead (F)' : 'Follow playhead (F)')
	const snapLabel = $derived(timeline.isSnapping ? 'Snapping to the grid (S) · hold Shift to move freely' : 'Snap to the grid (S)')
</script>

<div class="dock-toolbar" role="toolbar" aria-label="Editor tools" aria-orientation="vertical">
	<z-tooltip content="Go to beginning (Home)" placement="right">
		<button class="dock-toolbar-button" type="button" disabled={!canPlay} aria-label="Go to beginning" {...press(goToBeginning)}>
			<SkipBackIcon weight="fill" />
		</button>
	</z-tooltip>
	<z-tooltip content={playLabel} placement="right">
		<button class="dock-toolbar-button isPlay" class:isPlaying={app.isPlaying} type="button" disabled={!canPlay} aria-label={playLabel} {...press(togglePlay)}>
			{#if app.isPlaying}
				<PauseIcon weight="fill" />
			{:else}
				<PlayIcon weight="fill" />
			{/if}
		</button>
	</z-tooltip>
	<z-tooltip content={loopLabel} placement="right">
		<button class="dock-toolbar-button" class:isPressed={app.isLoopEnabled} type="button" disabled={!canPlay} aria-pressed={app.isLoopEnabled} aria-label="Loop" {...press(toggleLoop)}>
			<RepeatIcon weight="bold" />
		</button>
	</z-tooltip>

	<span class="dock-toolbar-divider"></span>

	<z-tooltip content="Add a layer" placement="right">
		<button class="dock-toolbar-button" type="button" aria-label="Add a layer" onclick={(event) => openAddLayerMenu(event.currentTarget)}>
			<PlusIcon weight="bold" />
		</button>
	</z-tooltip>
	<z-tooltip content={foldLabel} placement="right">
		<button class="dock-toolbar-button" class:isPressed={isFolded} type="button" aria-pressed={isFolded} aria-label={foldLabel} {...press(toggleDockFolded)}>
			{#if isFolded}
				<CaretDoubleUpIcon weight="bold" />
			{:else}
				<CaretDoubleDownIcon weight="bold" />
			{/if}
		</button>
	</z-tooltip>

	<span class="dock-toolbar-divider"></span>

	<z-tooltip content="Undo (⌘Z)" placement="right">
		<button class="dock-toolbar-button" type="button" disabled={!canUndo} aria-label="Undo" {...press(undo)}>
			<ArrowUUpLeftIcon weight="bold" />
		</button>
	</z-tooltip>
	<z-tooltip content="Redo (⇧⌘Z)" placement="right">
		<button class="dock-toolbar-button" type="button" disabled={!canRedo} aria-label="Redo" {...press(redo)}>
			<ArrowUUpRightIcon weight="bold" />
		</button>
	</z-tooltip>

	<span class="dock-toolbar-divider"></span>

	<z-tooltip content={followLabel} placement="right">
		<button class="dock-toolbar-button" class:isPressed={timeline.isFollowing} type="button" aria-pressed={timeline.isFollowing} aria-label="Follow playhead" {...press(toggleFollowing)}>
			<CrosshairSimpleIcon weight="bold" />
		</button>
	</z-tooltip>
	<z-tooltip content={snapLabel} placement="right">
		<button class="dock-toolbar-button" class:isPressed={timeline.isSnapping} type="button" aria-pressed={timeline.isSnapping} aria-label="Snap to grid" {...press(toggleSnapping)}>
			<MagnetStraightIcon weight="bold" />
		</button>
	</z-tooltip>

	<span class="dock-toolbar-divider"></span>

	<z-tooltip content="Zoom in (=)" placement="right">
		<button class="dock-toolbar-button" type="button" aria-label="Zoom in" {...press(zoomIn)}>
			<MagnifyingGlassPlusIcon weight="bold" />
		</button>
	</z-tooltip>
	<z-tooltip content="Zoom out (−)" placement="right">
		<button class="dock-toolbar-button" type="button" disabled={isFitted} aria-label="Zoom out" {...press(zoomOut)}>
			<MagnifyingGlassMinusIcon weight="bold" />
		</button>
	</z-tooltip>
</div>
