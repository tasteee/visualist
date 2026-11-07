<script lang="ts">
	import { recordHistory } from '../automation.svelte'
	import { MIN_CLIP_SECONDS, clamp } from '../engine/settings'
	import { getVideoDuration } from '../engine/video'
	import { formatPreciseTime, ratioToTime, snapToGrid, timeToPercent } from '../engine/timeline'
	import type { TimelineGridT } from '../engine/timeline'
	import type { ClipT, LayerT } from '../engine/types'
	import { setLayerTimeRange } from '../layers.svelte'
	import { pickClip } from '../selection.svelte'
	import { app } from '../store.svelte'
	import { timeline } from '../timeline.svelte'
	import './LayerClip.css'

	type LayerClipPropsT = {
		layer: LayerT
		clip: ClipT
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

	const isVideoLayer = (): boolean => props.layer.kind === 'video'

	const view = $derived(timeline.view)
	const duration = $derived(app.duration)
	const startTime = $derived(isVideoLayer() ? props.clip.startTime : Math.min(props.clip.startTime, duration))
	const isVideo = $derived(props.layer.kind === 'video')
	// A text clip is named by its words.
	const clipLabel = $derived(props.clip.name || (props.layer.kind === 'text' && props.clip.text.trim().length > 0 ? props.clip.text.replace(/s+/g, ' ').trim() : props.layer.name))
	const sourceOffset = $derived(props.clip.sourceOffset)
	// A video plays its file once. Where it ends if it is never cut short.
	const naturalEnd = $derived(startTime + Math.max(0, getVideoDuration(props.layer.assetId) - sourceOffset))
	const endTime = $derived(props.clip.endTime ?? (isVideo ? naturalEnd : duration))
	const leftPercent = $derived(clamp(timeToPercent(startTime, view), -1, 101))
	const rightPercent = $derived(clamp(100 - timeToPercent(endTime, view), -1, 101))
	const isDragging = $derived(drag !== null)
	const isFullSong = $derived(startTime <= 0 && props.clip.endTime === null)
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
		pickClip(props.layer.id, props.clip.id)
	}

	// A video can sit anywhere on the timeline, even past the end,
	// which makes the project longer.
	const moveVideo = (event: PointerEvent, activeDrag: ClipDragT) => {
		const nextStart = Math.max(0, readTime(event) - activeDrag.grabOffset)
		const snappedStart = snapTime(nextStart, event, Number.POSITIVE_INFINITY)
		props.clip.startTime = snappedStart
		props.clip.endTime = snappedStart + activeDrag.length
	}

	// Trimming a video's start moves where in the file it begins, so
	// the picture stays where it was on the timeline.
	const trimVideoStart = (event: PointerEvent) => {
		const earliest = Math.max(0, startTime - sourceOffset)
		const latest = endTime - MIN_CLIP_SECONDS
		const nextStart = clamp(snapTime(readTime(event), event, latest), earliest, latest)
		props.clip.sourceOffset = Math.max(0, sourceOffset + nextStart - startTime)
		props.clip.startTime = nextStart
	}

	const trimVideoEnd = (event: PointerEvent) => {
		const nextEnd = clamp(snapTime(readTime(event), event, naturalEnd), startTime + MIN_CLIP_SECONDS, naturalEnd)
		props.clip.endTime = nextEnd
	}

	const dragVideo = (event: PointerEvent, activeDrag: ClipDragT) => {
		if (activeDrag.mode === 'move') return moveVideo(event, activeDrag)
		if (activeDrag.mode === 'start') return trimVideoStart(event)
		trimVideoEnd(event)
	}

	const moveClip = (event: PointerEvent, activeDrag: ClipDragT) => {
		const pointerTime = readTime(event)
		const latestStart = Math.max(0, duration - activeDrag.length)
		const nextStart = clamp(pointerTime - activeDrag.grabOffset, 0, latestStart)
		const snappedStart = snapTime(nextStart, event, latestStart)
		setLayerTimeRange(props.layer.id, props.clip.id, snappedStart, snappedStart + activeDrag.length, duration)
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
		if (isStartEdge) return setLayerTimeRange(props.layer.id, props.clip.id, edgeTime, endTime, duration)
		setLayerTimeRange(props.layer.id, props.clip.id, startTime, edgeTime, duration)
	}

	const handleUp = () => {
		drag = null
	}

	// Double-click fills the whole song again.
	const handleDoubleClick = (event: MouseEvent) => {
		event.stopPropagation()
		if (isVideo) return
		if (isFullSong) return
		recordHistory()
		setLayerTimeRange(props.layer.id, props.clip.id, 0, duration, duration)
	}

	const nudgeVideo = (step: number, shouldMoveEnd: boolean) => {
		if (shouldMoveEnd) {
			props.clip.endTime = clamp(endTime + step, startTime + MIN_CLIP_SECONDS, naturalEnd)
			return
		}
		const length = endTime - startTime
		const nextStart = Math.max(0, startTime + step)
		props.clip.startTime = nextStart
		props.clip.endTime = nextStart + length
	}

	// Arrows move the clip, Shift+arrows move only its end.
	const handleKey = (event: KeyboardEvent) => {
		const isLeft = event.key === 'ArrowLeft'
		const isRight = event.key === 'ArrowRight'
		if (!isLeft && !isRight) return
		event.preventDefault()
		recordHistory()
		const step = isLeft ? -KEY_STEP_SECONDS : KEY_STEP_SECONDS
		if (isVideo) return nudgeVideo(step, event.shiftKey)
		if (event.shiftKey) return setLayerTimeRange(props.layer.id, props.clip.id, startTime, endTime + step, duration)
		const length = endTime - startTime
		const nextStart = clamp(startTime + step, 0, Math.max(0, duration - length))
		setLayerTimeRange(props.layer.id, props.clip.id, nextStart, nextStart + length, duration)
	}
</script>

<div
	class="layer-clip"
	class:isSelected={props.isSelected}
	class:isDragging
	class:isHidden={!props.layer.isVisible || !props.clip.isActive}
	class:isFullSong
	data-tone={props.clip.color ?? undefined}
	bind:this={root}
	style:--clip-left="{leftPercent}%"
	style:--clip-right="{rightPercent}%"
	role="group"
	aria-label={props.layer.name}
	onpointermove={handleMove}
	onpointerup={handleUp}
	onpointercancel={handleUp}
>
	<div
		class="layer-clip-bar"
		data-clip-control
		role="slider"
		tabindex="0"
		title="{props.layer.name} · {rangeLabel} · drag to move"
		aria-label={ariaLabel}
		aria-valuemin={0}
		aria-valuemax={duration}
		aria-valuenow={startTime}
		onpointerdown={handleDown}
		ondblclick={handleDoubleClick}
		onkeydown={handleKey}
	>
		<span class="layer-clip-label">
			<span class="layer-clip-name">{clipLabel}</span>
			{#if isDragging}
				<span class="layer-clip-range">{rangeLabel}</span>
			{/if}
		</span>
	</div>
	<span class="layer-clip-edge isStart" data-clip-control data-edge="start" role="presentation" onpointerdown={handleDown}></span>
	<span class="layer-clip-edge isEnd" data-clip-control data-edge="end" role="presentation" onpointerdown={handleDown}></span>
</div>
