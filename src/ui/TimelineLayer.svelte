<script lang="ts">
	import type { Snippet } from 'svelte'
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon'
	import EyeIcon from 'phosphor-svelte/lib/EyeIcon'
	import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlashIcon'
	import ImageIcon from 'phosphor-svelte/lib/ImageIcon'
	import PenNibIcon from 'phosphor-svelte/lib/PenNibIcon'
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon'
	import SlidersHorizontalIcon from 'phosphor-svelte/lib/SlidersHorizontalIcon'
	import SparkleIcon from 'phosphor-svelte/lib/SparkleIcon'
	import TextTIcon from 'phosphor-svelte/lib/TextTIcon'
	import WaveformIcon from 'phosphor-svelte/lib/WaveformIcon'
	import { getRowHeightStyle } from '../appearance.svelte'
	import { PATH_WIDTH } from '../engine/automation'
	import type { ColorNameT } from '../engine/palette'
	import { checkIsTimeVisible, timeToPercent, timeToRatio } from '../engine/timeline'
	import type { GridLineT, TimelineGridT } from '../engine/timeline'
	import type { LayerKindT } from '../engine/types'
	import { app } from '../store.svelte'
	import { timeline } from '../timeline.svelte'
	import ColorDot from './ColorDot.svelte'
	import RowResizer from './RowResizer.svelte'
	import './TimelineLayer.css'

	// One layer in the timeline: the audio, the scene settings,
	// or a visual layer. Its automation lanes render below it
	// when it is open.
	type TimelineLayerPropsT = {
		kind: 'global' | 'audio' | LayerKindT
		rowId: string
		color: ColorNameT
		title: string
		detail: string
		grid: TimelineGridT
		isCollapsed: boolean
		isSelected?: boolean
		isHidden?: boolean
		canAddLane: boolean
		addLabel?: string
		ontoggle: () => void
		onadd: () => void
		onselect?: () => void
		ontogglevisible?: () => void
		// Visual layers can be dragged by their name to reorder,
		// or moved with Alt+Up and Alt+Down.
		layerId?: string
		isDragSource?: boolean
		dropEdge?: 'before' | 'after' | null
		onreorderstart?: (event: PointerEvent) => void
		onreorderkey?: (direction: 'forward' | 'backward') => void
		track?: Snippet
	}

	const props: TimelineLayerPropsT = $props()

	const view = $derived(timeline.view)
	const isGlobal = $derived(props.kind === 'global')
	const isAudio = $derived(props.kind === 'audio')
	const isVisual = $derived(!isGlobal && !isAudio)
	const isLogo = $derived(props.kind === 'logo')
	const isText = $derived(props.kind === 'text')
	const isImage = $derived(props.kind === 'image')
	const isSvg = $derived(props.kind === 'svg')
	const canSelect = $derived(props.onselect !== undefined)
	const canToggleVisible = $derived(props.ontogglevisible !== undefined)
	const collapseLabel = $derived(props.isCollapsed ? `Show ${props.title} automations` : `Hide ${props.title} automations`)
	const defaultAddLabel = $derived(props.canAddLane ? `Automate a ${props.title} control` : `Every ${props.title} control is automated`)
	const addLabel = $derived(props.addLabel ?? defaultAddLabel)
	const visibilityLabel = $derived(props.isHidden ? `Show ${props.title}` : `Hide ${props.title}`)
	const barLines = $derived(props.grid.lines.filter((line) => line.kind === 'label' || line.kind === 'bar'))
	const playheadPercent = $derived(timeToPercent(app.currentTime, view))
	const isPlayheadVisible = $derived(checkIsTimeVisible(app.currentTime, view))
	const customHeight = $derived(getRowHeightStyle(props.rowId))

	// The audio row draws its own waveform, playhead and grid.
	const hasOverlay = $derived(!isAudio)

	const getGridX = (line: GridLineT): number => timeToRatio(line.time, view) * PATH_WIDTH

	const canReorder = $derived(props.onreorderstart !== undefined)
	const isDropBefore = $derived(props.dropEdge === 'before')
	const isDropAfter = $derived(props.dropEdge === 'after')
	const titleLabel = $derived(canReorder ? `Edit ${props.title}. Drag to reorder, or press Alt with an arrow key.` : `Edit ${props.title}`)

	const handleSelect = () => props.onselect?.()

	const handleTitleDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		props.onreorderstart?.(event)
	}

	// Up moves toward the front, which sits higher in the list.
	const handleTitleKey = (event: KeyboardEvent) => {
		if (!event.altKey) return
		const isUp = event.key === 'ArrowUp'
		const isDown = event.key === 'ArrowDown'
		if (!isUp && !isDown) return
		event.preventDefault()
		const direction = isUp ? 'forward' : 'backward'
		props.onreorderkey?.(direction)
	}
</script>

<div
	class="timeline-layer"
	class:isSelected={props.isSelected}
	class:isHidden={props.isHidden}
	class:isVisual
	class:isAudio
	class:isCollapsed={props.isCollapsed}
	class:isDragSource={props.isDragSource}
	class:isDropBefore
	class:isDropAfter
	data-layer-group={props.layerId}
	data-tone={props.color}
	style:--timeline-layer-custom-height={customHeight}
>
	<div class="timeline-layer-header">
		<button class="timeline-layer-caret" type="button" aria-expanded={!props.isCollapsed} aria-label={collapseLabel} onclick={props.ontoggle}>
			<CaretRightIcon weight="bold" />
		</button>

		<ColorDot rowId={props.rowId} color={props.color} label={props.title} />

		<button
			class="timeline-layer-title"
			class:canSelect
			class:canReorder
			type="button"
			disabled={!canSelect}
			aria-label={titleLabel}
			onclick={handleSelect}
			onpointerdown={handleTitleDown}
			onkeydown={handleTitleKey}
		>
			<span class="timeline-layer-icon" aria-hidden="true">
				{#if isAudio}
					<WaveformIcon weight="bold" />
				{/if}
				{#if isGlobal}
					<SlidersHorizontalIcon weight="bold" />
				{/if}
				{#if isLogo}
					<SparkleIcon weight="fill" />
				{/if}
				{#if isText}
					<TextTIcon weight="bold" />
				{/if}
				{#if isImage}
					<ImageIcon weight="bold" />
				{/if}
				{#if isSvg}
					<PenNibIcon weight="bold" />
				{/if}
			</span>
			<span class="timeline-layer-text">
				<span class="timeline-layer-name">{props.title}</span>
				<span class="timeline-layer-detail">{props.detail}</span>
			</span>
		</button>

		<div class="timeline-layer-actions">
			{#if canToggleVisible}
				<z-tooltip content={visibilityLabel} placement="top" openDelay={300}>
					<button class="timeline-layer-action" type="button" aria-label={visibilityLabel} aria-pressed={props.isHidden} onclick={props.ontogglevisible}>
						{#if props.isHidden}
							<EyeSlashIcon weight="bold" />
						{/if}
						{#if !props.isHidden}
							<EyeIcon weight="bold" />
						{/if}
					</button>
				</z-tooltip>
			{/if}
			<z-tooltip content={addLabel} placement="top" openDelay={300}>
				<button class="timeline-layer-action" type="button" aria-label={addLabel} disabled={!props.canAddLane} onclick={props.onadd}>
					<PlusIcon weight="bold" />
				</button>
			</z-tooltip>
		</div>
	</div>

	<div class="timeline-layer-track" data-track="layer">
		{#if hasOverlay}
			<svg class="timeline-layer-grid" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
				{#each barLines as line (line.time)}
					<line class="timeline-layer-gridline" class:isLabel={line.kind === 'label'} x1={getGridX(line)} x2={getGridX(line)} y1="0" y2="100" />
				{/each}
			</svg>
		{/if}
		{#if props.track}
			{@render props.track()}
		{/if}
		{#if hasOverlay && isPlayheadVisible}
			<div class="timeline-layer-playhead" style:--layer-x="{playheadPercent}%"></div>
		{/if}
	</div>

	<RowResizer rowId={props.rowId} label={props.title} />
</div>
