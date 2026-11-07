<script lang="ts">
	import type { Snippet } from 'svelte'
	import ImageIcon from 'phosphor-svelte/lib/ImageIcon'
	import MusicNotesIcon from 'phosphor-svelte/lib/MusicNotesIcon'
	import ShapesIcon from 'phosphor-svelte/lib/ShapesIcon'
	import SparkleIcon from 'phosphor-svelte/lib/SparkleIcon'
	import TextAaIcon from 'phosphor-svelte/lib/TextAaIcon'
	import VectorTwoIcon from 'phosphor-svelte/lib/VectorTwoIcon'
	import VideoCameraIcon from 'phosphor-svelte/lib/VideoCameraIcon'
	import EyeIcon from 'phosphor-svelte/lib/EyeIcon'
	import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlashIcon'
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon'
	import { PATH_WIDTH } from '../engine/automation'
	import type { ColorNameT } from '../engine/palette'
	import { checkIsTimeVisible, timeToPercent, timeToRatio } from '../engine/timeline'
	import type { GridLineT, TimelineGridT } from '../engine/timeline'
	import type { LayerKindT } from '../engine/types'
	import { clamp } from '../engine/settings'
	import { ratioToTime, snapToGrid } from '../engine/timeline'
	import { app, seekTo } from '../store.svelte'
	import { timeline } from '../timeline.svelte'
	import { getRowHeight, resetRowHeight, setRowHeight } from '../appearance.svelte'
	import { recordHistory } from '../automation.svelte'
	import type { RowRefT } from '../rowLayout.svelte'
	import { openRowInspector } from '../rowInspector.svelte'
	import type { InspectorRowKindT } from '../rowInspector.svelte'
	import { rowHeader } from './rowHeader'
	import './TimelineLayer.css'

	// One layer in the timeline: the audio, the scene settings,
	// or a visual layer. Its automation lanes render below it
	// when it is open.
	type TimelineLayerPropsT = {
		kind: LayerKindT
		rowId: string
		color: ColorNameT
		title: string
		grid: TimelineGridT
		isSelected?: boolean
		isHidden?: boolean
		ondelete?: () => void
		// A click on the header away from its controls.
		onselect?: (event: PointerEvent) => void
		// The rows that follow along with the primary modifier.
		siblings?: RowRefT[]
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
	const isAudio = $derived(props.kind === 'audio')
	const canToggleVisible = $derived(props.ontogglevisible !== undefined)
	const deleteLabel = $derived(`Delete ${props.title}`)
	const visibilityLabel = $derived(props.isHidden ? `Show ${props.title}` : `Hide ${props.title}`)
	// Every line the ruler draws, so what a click snaps to is visible.
	const gridLines = $derived(props.grid.lines)
	const playheadPercent = $derived(timeToPercent(app.currentTime, view))
	const isPlayheadVisible = $derived(checkIsTimeVisible(app.currentTime, view))
	const row = $derived<RowRefT>({ kind: 'layer', id: props.rowId })
	const siblingRows = $derived(props.siblings ?? [])
	const inspectorKind: InspectorRowKindT = 'layer'

	const getGridX = (line: GridLineT): number => timeToRatio(line.time, view) * PATH_WIDTH

	const canReorder = $derived(props.onreorderstart !== undefined)
	const isDropBefore = $derived(props.dropEdge === 'before')
	const isDropAfter = $derived(props.dropEdge === 'after')

	// A click on empty space in a layer's row sets the playhead there.
	// Clips and their handles keep their own clicks.
	const handleTrackClick = (event: MouseEvent) => {
		const target = event.target as Element
		const isOnClip = target.closest('.layer-clip, .audio-clip, [data-clip-control]') !== null
		if (isOnClip) return
		const bounds = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null
		if (bounds === null) return
		const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
		const rawTime = clamp(ratioToTime(ratio, view), 0, app.duration)
		const shouldSnap = timeline.isSnapping && !event.shiftKey
		seekTo(shouldSnap ? snapToGrid(rawTime, props.grid) : rawTime)
	}

	// Audio layers stretch to show more of their waveform.
	const MIN_HEIGHT = 64
	const MAX_HEIGHT = 160
	let resizeDrag: { startY: number; startHeight: number; hasMoved: boolean } | null = null

	const storedHeight = $derived(isAudio ? getRowHeight(props.rowId) : null)
	const customHeight = $derived(storedHeight === null ? undefined : `${clamp(storedHeight, MIN_HEIGHT, MAX_HEIGHT)}px`)

	const handleResizeDown = (event: PointerEvent) => {
		if (event.button !== 0) return
		event.stopPropagation()
		event.preventDefault()
		const handle = event.currentTarget as HTMLElement
		handle.setPointerCapture(event.pointerId)
		const startHeight = clamp(storedHeight ?? MIN_HEIGHT, MIN_HEIGHT, MAX_HEIGHT)
		resizeDrag = { startY: event.clientY, startHeight, hasMoved: false }
	}

	const handleResizeMove = (event: PointerEvent) => {
		const drag = resizeDrag
		if (drag === null) return
		const travel = event.clientY - drag.startY
		if (!drag.hasMoved && Math.abs(travel) < 3) return
		if (!drag.hasMoved) recordHistory()
		drag.hasMoved = true
		setRowHeight(props.rowId, clamp(drag.startHeight + travel, MIN_HEIGHT, MAX_HEIGHT))
	}

	const handleResizeUp = () => {
		resizeDrag = null
	}

	const handleResizeReset = () => {
		recordHistory()
		resetRowHeight(props.rowId)
	}

	const handleInspect = (anchor: HTMLElement) => openRowInspector(inspectorKind, props.rowId, anchor)

	const handleReorder = (event: PointerEvent) => props.onreorderstart?.(event)

	// Up moves toward the front, which sits higher in the list.
	const handleHeaderKey = (event: KeyboardEvent) => {
		if (!event.altKey) return
		const isUp = event.key === 'ArrowUp'
		const isDown = event.key === 'ArrowDown'
		if (!isUp && !isDown) return
		event.preventDefault()
		const direction = isUp ? 'forward' : 'backward'
		props.onreorderkey?.(direction)
	}

	const headerOptions = $derived({
		row,
		getSiblings: () => siblingRows,
		canResize: false,
		onselect: props.onselect,
		onreorder: canReorder ? handleReorder : undefined,
		oninspect: handleInspect
	})
</script>

<div
	class="timeline-layer"
	class:isSelected={props.isSelected}
	class:isHidden={props.isHidden}
	class:isAudio
	style:--timeline-layer-custom-height={customHeight}
	class:isDragSource={props.isDragSource}
	class:isDropBefore
	class:isDropAfter
	data-layer-group={props.layerId}
	data-tone={props.color}
>
	<div class="timeline-layer-header" class:canReorder role="presentation" use:rowHeader={headerOptions} onkeydown={handleHeaderKey}>
		<span class="timeline-layer-type" aria-hidden="true" title={props.kind} style="margin-right: var(--spacing-2)">
			{#if props.kind === 'text'}
				<TextAaIcon weight="bold" />
			{:else if props.kind === 'video'}
				<VideoCameraIcon weight="bold" />
			{:else if props.kind === 'audio'}
				<MusicNotesIcon weight="bold" />
			{:else if props.kind === 'image'}
				<ImageIcon weight="bold" />
			{:else if props.kind === 'svg'}
				<VectorTwoIcon weight="bold" />
			{:else if props.kind === 'shape'}
				<ShapesIcon weight="bold" />
			{:else}
				<SparkleIcon weight="bold" />
			{/if}
		</span>

		<span class="timeline-layer-name">{props.title}</span>

		<div class="timeline-layer-actions">
			{#if props.ondelete}
				<z-tooltip content={deleteLabel} placement="top" openDelay={300}>
					<z-button class="timeline-layer-action" isIcon size="sm" kind="ghost" tone="danger" aria-label={deleteLabel} onclick={props.ondelete}>
						<TrashIcon weight="bold" />
					</z-button>
				</z-tooltip>
			{/if}
			{#if canToggleVisible}
				<z-tooltip content={visibilityLabel} placement="top" openDelay={300}>
					<z-button class="timeline-layer-action" isIcon size="sm" kind="ghost" tone="neutral" aria-label={visibilityLabel} aria-pressed={props.isHidden} onclick={props.ontogglevisible}>
						{#if props.isHidden}
							<EyeSlashIcon weight="bold" />
						{:else}
							<EyeIcon weight="bold" />
						{/if}
					</z-button>
				</z-tooltip>
			{/if}
		</div>
	</div>

	<div class="timeline-layer-track" data-track="layer" role="presentation" onclick={handleTrackClick}>
		<svg class="timeline-layer-grid" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
			{#each gridLines as line (line.time)}
				<line class="timeline-layer-gridline" class:isLabel={line.kind === 'label'} class:isSub={line.kind === 'sub'} x1={getGridX(line)} x2={getGridX(line)} y1="0" y2="100" />
			{/each}
		</svg>
		{#if props.track}
			{@render props.track()}
		{/if}
		{#if isPlayheadVisible}
			<div class="timeline-layer-playhead" style:--layer-x="{playheadPercent}%"></div>
		{/if}
	</div>


	{#if isAudio}
		<button
			class="timeline-layer-resize"
			type="button"
			tabindex="-1"
			aria-label="Resize {props.title} height. Drag, or double-click to reset."
			title="Drag to resize · double-click to reset"
			onpointerdown={handleResizeDown}
			onpointermove={handleResizeMove}
			onpointerup={handleResizeUp}
			onpointercancel={handleResizeUp}
			ondblclick={handleResizeReset}
		></button>
	{/if}
</div>
