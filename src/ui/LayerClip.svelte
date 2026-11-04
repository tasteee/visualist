<script lang="ts">
	import { recordHistory } from '../automation.svelte'
	import { clamp } from '../engine/settings'
	import { formatPreciseTime, ratioToTime, snapToGrid, timeToPercent } from '../engine/timeline'
	import type { TimelineGridT } from '../engine/timeline'
	import type { LayerT } from '../engine/types'
	import { focusLayer, setLayerTimeRange } from '../layers.svelte'
	import { app } from '../store.svelte'
	import { timeline } from '../timeline.svelte'
	import './LayerClip.css'

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
	const KEY_STEP_SECONDS = 0.1

	let root: HTMLDivElement
	let drag = $state<ClipDragT | null>(null)

	const view = $derived(timeline.view)
	const duration = $derived(app.duration)
	const startTime = $derived(Math.min(props.layer.startTime, duration))
	const endTime = $derived(props.layer.endTime ?? duration)
	const leftPercent = $derived(clamp(timeToPercent(startTime, view), -1, 101))
	const rightPercent = $derived(clamp(100 - timeToPercent(endTime, view), -1, 101))
	const isDragging = $derived(drag !== null)
	const isFullSong = $derived(startTime <= 0 && props.layer.endTime === null)
	const rangeLabel = $derived(`${formatPreciseTime(startTime)} – ${formatPreciseTime(endTime)}`)
	const ariaLabel = $derived(`${props.layer.name} shows from ${rangeLabel}. Drag to move, drag an edge to trim.`)

	const readTime = (event: PointerEvent): number => {
		const track = root.closest<HTMLElement>('[data-track]')
		if (track === null) return 0
		const bounds = track.getBoundingClientRect()
		const ratio = (event.clientX - bounds.left) / bounds.width
		return clamp(ratioToTime(ratio, view), 0, duration)
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

	const handleDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		event.stopPropagation()
		root.setPointerCapture(event.pointerId)
		const pointerTime = readTime(event)
		const mode = readMode(event)
		drag = { mode, grabOffset: pointerTime - startTime, length: endTime - startTime, hasMoved: false, startX: event.clientX }
		focusLayer(props.layer.id)
	}

	const moveClip = (event: PointerEvent, activeDrag: ClipDragT) => {
		const pointerTime = readTime(event)
		const latestStart = Math.max(0, duration - activeDrag.length)
		const nextStart = clamp(pointerTime - activeDrag.grabOffset, 0, latestStart)
		const snappedStart = snapTime(nextStart, event, latestStart)
		setLayerTimeRange(props.layer.id, snappedStart, snappedStart + activeDrag.length, duration)
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
		if (activeDrag.mode === 'move') return moveClip(event, activeDrag)
		const edgeTime = snapTime(readTime(event), event, duration)
		const isStartEdge = activeDrag.mode === 'start'
		if (isStartEdge) return setLayerTimeRange(props.layer.id, edgeTime, endTime, duration)
		setLayerTimeRange(props.layer.id, startTime, edgeTime, duration)
	}

	const handleUp = () => {
		drag = null
	}

	// Double-click fills the whole song again.
	const handleDoubleClick = (event: MouseEvent) => {
		event.stopPropagation()
		if (isFullSong) return
		recordHistory()
		setLayerTimeRange(props.layer.id, 0, duration, duration)
	}

	// Arrows move the clip, Shift+arrows move only its end.
	const handleKey = (event: KeyboardEvent) => {
		const isLeft = event.key === 'ArrowLeft'
		const isRight = event.key === 'ArrowRight'
		if (!isLeft && !isRight) return
		event.preventDefault()
		recordHistory()
		const step = isLeft ? -KEY_STEP_SECONDS : KEY_STEP_SECONDS
		if (event.shiftKey) return setLayerTimeRange(props.layer.id, startTime, endTime + step, duration)
		const length = endTime - startTime
		const nextStart = clamp(startTime + step, 0, Math.max(0, duration - length))
		setLayerTimeRange(props.layer.id, nextStart, nextStart + length, duration)
	}
</script>

<div
	class="layer-clip"
	class:isSelected={props.isSelected}
	class:isDragging
	class:isHidden={!props.layer.isVisible}
	class:isFullSong
	bind:this={root}
	style:--clip-left="{leftPercent}%"
	style:--clip-right="{rightPercent}%"
	role="slider"
	tabindex="0"
	aria-label={ariaLabel}
	aria-valuemin={0}
	aria-valuemax={duration}
	aria-valuenow={startTime}
	onpointerdown={handleDown}
	onpointermove={handleMove}
	onpointerup={handleUp}
	onpointercancel={handleUp}
	ondblclick={handleDoubleClick}
	onkeydown={handleKey}
>
	<span class="layer-clip-edge isStart" data-edge="start" aria-hidden="true"></span>
	<span class="layer-clip-label">
		<span class="layer-clip-name">{props.layer.name}</span>
		{#if isDragging}
			<span class="layer-clip-range">{rangeLabel}</span>
		{/if}
	</span>
	<span class="layer-clip-edge isEnd" data-edge="end" aria-hidden="true"></span>
</div>
