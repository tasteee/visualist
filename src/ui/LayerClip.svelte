<script lang="ts">
	import { recordHistory } from '../automation.svelte'
	import { MIN_CLIP_SECONDS, clamp } from '../engine/settings'
	import { formatPreciseTime, ratioToTime, snapToGrid, timeToPercent } from '../engine/timeline'
	import type { TimelineGridT } from '../engine/timeline'
	import type { LayerT } from '../engine/types'
	import { getVideoDuration } from '../engine/video'
	import { layerStore, setLayerTimeRange } from '../layers.svelte'
	import { pickLayer, readModifiers } from '../selection.svelte'
	import { app, seekTo } from '../store.svelte'
	import { timeline } from '../timeline.svelte'
	import './LayerClip.css'

	// A text, image, shape or video layer on the timeline. The bar along
	// its top selects it and drags it along the timeline. Its edges trim
	// where it starts and ends. Clicking its body selects it and puts
	// the playhead there, ready to slice.
	type LayerClipPropsT = {
		layer: LayerT
		grid: TimelineGridT
		isSelected: boolean
	}

	type DragModeT = 'move' | 'start' | 'end'

	type ClipDragT = {
		mode: DragModeT
		grabOffset: number
		length: number
		hasMoved: boolean
		startX: number
	}

	const props: LayerClipPropsT = $props()

	const MOVE_THRESHOLD_PX = 3

	let root: HTMLDivElement
	let drag = $state<ClipDragT | null>(null)

	const view = $derived(timeline.view)
	const duration = $derived(app.duration)
	const isVideo = $derived(props.layer.kind === 'video')
	const sourceOffset = $derived(props.layer.sourceOffset)
	const startTime = $derived(isVideo ? props.layer.startTime : Math.min(props.layer.startTime, duration))
	// A video plays its file once. Where it ends if it is never cut short.
	const naturalEnd = $derived(startTime + Math.max(0, getVideoDuration(props.layer.assetId) - sourceOffset))
	const endTime = $derived(props.layer.endTime ?? (isVideo ? naturalEnd : duration))
	const leftPercent = $derived(clamp(timeToPercent(startTime, view), -1, 101))
	const rightPercent = $derived(clamp(100 - timeToPercent(endTime, view), -1, 101))
	const isDragging = $derived(drag !== null)
	const rangeLabel = $derived(`${formatPreciseTime(startTime)} – ${formatPreciseTime(endTime)}`)
	const ariaLabel = $derived(`${props.layer.name} shows from ${rangeLabel}`)
	const barTitle = $derived(`${props.layer.name} · ${rangeLabel} · drag to move`)

	const readTime = (event: PointerEvent): number => {
		const track = root.closest<HTMLElement>('[data-track]')
		if (track === null) return 0
		const bounds = track.getBoundingClientRect()
		const ratio = (event.clientX - bounds.left) / bounds.width
		return clamp(ratioToTime(ratio, view), 0, Number.POSITIVE_INFINITY)
	}

	// Shift frees the clip from the beat grid, like points.
	const snapTime = (time: number, event: PointerEvent, latest: number): number => {
		const shouldSnap = timeline.isSnapping && !event.shiftKey
		if (!shouldSnap) return time
		return clamp(snapToGrid(time, props.grid), 0, latest)
	}

	const readMode = (event: PointerEvent): DragModeT => {
		const target = event.target as HTMLElement
		const edge = target.dataset.edge
		if (edge === 'start') return 'start'
		if (edge === 'end') return 'end'
		return 'move'
	}

	const selectLayer = (event: PointerEvent) => {
		const orderedIds = [...layerStore.layers].reverse().map((layer) => layer.id)
		pickLayer(props.layer.id, orderedIds, readModifiers(event))
	}

	const handleDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		event.stopPropagation()
		root.setPointerCapture(event.pointerId)
		const pointerTime = readTime(event)
		const mode = readMode(event)
		drag = { mode, grabOffset: pointerTime - startTime, length: endTime - startTime, hasMoved: false, startX: event.clientX }
		selectLayer(event)
	}

	// A click on the body selects the clip and puts the playhead at
	// that point.
	const handleBodyDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		event.stopPropagation()
		selectLayer(event)
		const rawTime = Math.min(readTime(event), duration)
		const shouldSnap = timeline.isSnapping && !event.shiftKey
		seekTo(shouldSnap ? snapToGrid(rawTime, props.grid) : rawTime)
	}

	const moveClip = (event: PointerEvent, activeDrag: ClipDragT) => {
		const pointerTime = readTime(event)
		const latestStart = Math.max(0, duration - activeDrag.length)
		const nextStart = clamp(pointerTime - activeDrag.grabOffset, 0, latestStart)
		const snappedStart = snapTime(nextStart, event, latestStart)
		setLayerTimeRange(props.layer.id, snappedStart, snappedStart + activeDrag.length, duration)
	}

	// A video can sit anywhere on the timeline, even past the end,
	// which makes the project longer.
	const moveVideo = (event: PointerEvent, activeDrag: ClipDragT) => {
		const nextStart = Math.max(0, readTime(event) - activeDrag.grabOffset)
		const snappedStart = snapTime(nextStart, event, Number.POSITIVE_INFINITY)
		props.layer.startTime = snappedStart
		props.layer.endTime = snappedStart + activeDrag.length
	}

	// Trimming a video's start moves where in the file it begins, so
	// the picture stays where it was on the timeline.
	const trimVideoStart = (event: PointerEvent) => {
		const earliest = Math.max(0, startTime - sourceOffset)
		const latest = endTime - MIN_CLIP_SECONDS
		const nextStart = clamp(snapTime(readTime(event), event, latest), earliest, latest)
		props.layer.sourceOffset = Math.max(0, sourceOffset + nextStart - startTime)
		props.layer.startTime = nextStart
	}

	const trimVideoEnd = (event: PointerEvent) => {
		const nextEnd = clamp(snapTime(readTime(event), event, naturalEnd), startTime + MIN_CLIP_SECONDS, naturalEnd)
		props.layer.endTime = nextEnd
	}

	const dragVideo = (event: PointerEvent, activeDrag: ClipDragT) => {
		if (activeDrag.mode === 'move') return moveVideo(event, activeDrag)
		if (activeDrag.mode === 'start') return trimVideoStart(event)
		trimVideoEnd(event)
	}

	const handleMove = (event: PointerEvent) => {
		const activeDrag = drag
		if (activeDrag === null) return
		const travel = Math.abs(event.clientX - activeDrag.startX)
		const hasStartedMoving = activeDrag.hasMoved || travel >= MOVE_THRESHOLD_PX
		if (!hasStartedMoving) return
		// One drag is one undo step, recorded when it really
		// starts, so a plain click to select adds nothing.
		const isFirstMove = !activeDrag.hasMoved
		if (isFirstMove) recordHistory()
		activeDrag.hasMoved = true
		if (isVideo) return dragVideo(event, activeDrag)
		if (activeDrag.mode === 'move') return moveClip(event, activeDrag)
		const edgeTime = snapTime(readTime(event), event, duration)
		const isStartEdge = activeDrag.mode === 'start'
		if (isStartEdge) return setLayerTimeRange(props.layer.id, edgeTime, endTime, duration)
		setLayerTimeRange(props.layer.id, startTime, edgeTime, duration)
	}

	const handleUp = () => {
		drag = null
	}
</script>

<div
	class="layer-clip"
	class:isSelected={props.isSelected}
	class:isDragging
	class:isHidden={!props.layer.isVisible}
	bind:this={root}
	style:--clip-left="{leftPercent}%"
	style:--clip-right="{rightPercent}%"
	role="group"
	aria-label={ariaLabel}
	onpointermove={handleMove}
	onpointerup={handleUp}
	onpointercancel={handleUp}
>
	<div class="layer-clip-bar" data-clip-control role="presentation" title={barTitle} onpointerdown={handleDown}>
		<span class="layer-clip-name">{props.layer.name}</span>
		{#if isDragging}
			<span class="layer-clip-range">{rangeLabel}</span>
		{/if}
	</div>
	<div class="layer-clip-body" data-clip-control role="presentation" onpointerdown={handleBodyDown}></div>
	<span class="layer-clip-edge isStart" data-edge="start" data-clip-control role="presentation" onpointerdown={handleDown}></span>
	<span class="layer-clip-edge isEnd" data-edge="end" data-clip-control role="presentation" onpointerdown={handleDown}></span>
</div>
