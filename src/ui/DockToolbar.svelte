<script lang="ts">
	import ArrowUUpLeftIcon from 'phosphor-svelte/lib/ArrowUUpLeftIcon'
	import ArrowUUpRightIcon from 'phosphor-svelte/lib/ArrowUUpRightIcon'
	import CaretDoubleDownIcon from 'phosphor-svelte/lib/CaretDoubleDownIcon'
	import CaretDoubleUpIcon from 'phosphor-svelte/lib/CaretDoubleUpIcon'
	import MagnifyingGlassMinusIcon from 'phosphor-svelte/lib/MagnifyingGlassMinusIcon'
	import MagnifyingGlassPlusIcon from 'phosphor-svelte/lib/MagnifyingGlassPlusIcon'
	import PauseIcon from 'phosphor-svelte/lib/PauseIcon'
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon'
	import RepeatIcon from 'phosphor-svelte/lib/RepeatIcon'
	import SkipBackIcon from 'phosphor-svelte/lib/SkipBackIcon'
	import { automation, redo, undo } from '../automation.svelte'
	import { app, goToBeginning, toggleLoop, togglePlay } from '../store.svelte'
	import { checkIsFitted, zoomIn, zoomOut } from '../timeline.svelte'
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
	const foldLabel = $derived(isFolded ? 'Show the editor' : 'Fold the editor away')
</script>

<div class="dock-toolbar" role="toolbar" aria-label="Editor tools" aria-orientation="vertical">
	<z-tooltip content="Go to beginning (Home)" placement="right">
		<z-button isIcon size="sm" kind="ghost" tone="neutral" isDisabled={!canPlay} aria-label="Go to beginning" {...press(goToBeginning)}>
			<SkipBackIcon weight="fill" />
		</z-button>
	</z-tooltip>
	<z-tooltip content={playLabel} placement="right">
		<z-button isIcon size="sm" kind="solid" tone="primary" isDisabled={!canPlay} aria-label={playLabel} {...press(togglePlay)}>
			{#if app.isPlaying}
				<PauseIcon weight="fill" />
			{:else}
				<PlayIcon weight="fill" />
			{/if}
		</z-button>
	</z-tooltip>

	<span class="dock-toolbar-divider"></span>

	<z-tooltip content={foldLabel} placement="right">
		<z-button isIcon size="sm" kind={isFolded ? 'soft' : 'ghost'} tone="neutral" aria-pressed={isFolded} aria-label={foldLabel} {...press(toggleDockFolded)}>
			{#if isFolded}
				<CaretDoubleUpIcon weight="bold" />
			{:else}
				<CaretDoubleDownIcon weight="bold" />
			{/if}
		</z-button>
	</z-tooltip>

	<span class="dock-toolbar-divider"></span>

	<z-tooltip content="Undo (⌘Z)" placement="right">
		<z-button isIcon size="sm" kind="ghost" tone="neutral" isDisabled={!canUndo} aria-label="Undo" {...press(undo)}>
			<ArrowUUpLeftIcon weight="bold" />
		</z-button>
	</z-tooltip>
	<z-tooltip content="Redo (⇧⌘Z)" placement="right">
		<z-button isIcon size="sm" kind="ghost" tone="neutral" isDisabled={!canRedo} aria-label="Redo" {...press(redo)}>
			<ArrowUUpRightIcon weight="bold" />
		</z-button>
	</z-tooltip>


	<span class="dock-toolbar-divider"></span>

	<z-tooltip content="Zoom in (=)" placement="right">
		<z-button isIcon size="sm" kind="ghost" tone="neutral" aria-label="Zoom in" {...press(zoomIn)}>
			<MagnifyingGlassPlusIcon weight="bold" />
		</z-button>
	</z-tooltip>
	<z-tooltip content="Zoom out (−)" placement="right">
		<z-button isIcon size="sm" kind="ghost" tone="neutral" isDisabled={isFitted} aria-label="Zoom out" {...press(zoomOut)}>
			<MagnifyingGlassMinusIcon weight="bold" />
		</z-button>
	</z-tooltip>
</div>
