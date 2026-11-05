<script lang="ts">
	import { clamp } from '../engine/settings'
	import { checkIsTimeVisible, formatPreciseTime, panView, ratioToTime, timeToPercent, zoomView } from '../engine/timeline'
	import type { GridLineT, TimelineGridT, TimelineViewT } from '../engine/timeline'
	import { app, seekTo, setTrimEnd, setTrimStart } from '../store.svelte'
	import { setTrackWidth, setViewRange, timeline } from '../timeline.svelte'
	import './TimeRuler.css'

	type TimeRulerPropsT = {
		grid: TimelineGridT
	}

	type RulerDragT = {
		startX: number
		startY: number
		startView: TimelineViewT
		anchorTime: number
		hasMoved: boolean
	}

	type RangeDragKindT = 'start' | 'end' | 'move'

	type RangeDragT = {
		kind: RangeDragKindT
		startX: number
		startTrimStart: number
		startTrimEnd: number
	}

	const props: TimeRulerPropsT = $props()

	const DRAG_THRESHOLD_PX = 3
	const ZOOM_PER_PIXEL = 0.012
	const RANGE_KEY_SECONDS = 1

	let ruler: HTMLDivElement
	let rulerDrag: RulerDragT | null = null
	let rangeDrag: RangeDragT | null = null

	const rangeStartPercent = $derived(timeToPercent(app.trimStart, timeline.view))
	const rangeEndPercent = $derived(timeToPercent(app.trimEnd, timeline.view))
	const rangeWidthPercent = $derived(rangeEndPercent - rangeStartPercent)
	const canEditRange = $derived(app.hasAudio && !app.isRecording)
	const rangeStartText = $derived(`Export starts at ${formatPreciseTime(app.trimStart)}`)
	const rangeEndText = $derived(`Export ends at ${formatPreciseTime(app.trimEnd)}`)
	const isFullRange = $derived(app.trimStart <= 0.001 && app.trimEnd >= app.duration - 0.001)

	const playheadPercent = $derived(timeToPercent(app.currentTime, timeline.view))
	const isPlayheadVisible = $derived(checkIsTimeVisible(app.currentTime, timeline.view))

	// While playing, a hollow flag marks where stop returns to.
	const markerPercent = $derived(timeToPercent(app.playMarker, timeline.view))
	const isMarkerShown = $derived(app.isPlaying && checkIsTimeVisible(app.playMarker, timeline.view))

	const hoverTime = $derived(timeline.hoverTime)
	const hasHover = $derived(hoverTime !== null && checkIsTimeVisible(hoverTime, timeline.view))
	const hoverPercent = $derived(hoverTime === null ? 0 : timeToPercent(hoverTime, timeline.view))
	const hoverLabel = $derived(hoverTime === null ? '' : formatPreciseTime(hoverTime))

	const getLinePercent = (line: GridLineT): number => timeToPercent(line.time, timeline.view)

	$effect(() => {
		const observer = new ResizeObserver(() => setTrackWidth(ruler.clientWidth))
		observer.observe(ruler)
		return () => observer.disconnect()
	})

	const readPointerRatio = (event: PointerEvent): number => {
		const bounds = ruler.getBoundingClientRect()
		return clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
	}

	const readPointerTime = (event: PointerEvent): number => ratioToTime(readPointerRatio(event), timeline.view)

	// Ableton-style: drag up and down to zoom around the grabbed
	// spot, left and right to scroll. A plain click seeks.
	const handleRulerDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		ruler.setPointerCapture(event.pointerId)
		rulerDrag = {
			startX: event.clientX,
			startY: event.clientY,
			startView: { ...timeline.view },
			anchorTime: readPointerTime(event),
			hasMoved: false
		}
	}

	const handleRulerMove = (event: PointerEvent) => {
		if (rulerDrag === null) return
		const deltaX = event.clientX - rulerDrag.startX
		const deltaY = event.clientY - rulerDrag.startY
		const travel = Math.abs(deltaX) + Math.abs(deltaY)
		const isPastThreshold = travel > DRAG_THRESHOLD_PX
		if (isPastThreshold) rulerDrag.hasMoved = true
		if (!rulerDrag.hasMoved) return

		const zoomFactor = Math.exp(-deltaY * ZOOM_PER_PIXEL)
		const zoomed = zoomView(rulerDrag.startView, zoomFactor, rulerDrag.anchorTime, app.duration)
		const panSeconds = (-deltaX / ruler.clientWidth) * zoomed.span
		const panned = panView(zoomed, panSeconds, app.duration)
		setViewRange(panned.start, panned.start + panned.span)
	}

	const handleRulerUp = (event: PointerEvent) => {
		const drag = rulerDrag
		rulerDrag = null
		if (drag === null || drag.hasMoved) return
		seekTo(readPointerTime(event))
	}

	const handleRangeDown = (event: PointerEvent, kind: RangeDragKindT) => {
		event.stopPropagation()
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton || !canEditRange) return
		const target = event.currentTarget as HTMLElement
		target.setPointerCapture(event.pointerId)
		rangeDrag = { kind, startX: event.clientX, startTrimStart: app.trimStart, startTrimEnd: app.trimEnd }
	}

	const moveWholeRange = (deltaSeconds: number, drag: RangeDragT) => {
		const length = drag.startTrimEnd - drag.startTrimStart
		const nextStart = clamp(drag.startTrimStart + deltaSeconds, 0, app.duration - length)
		const isMovingRight = nextStart > app.trimStart
		if (isMovingRight) {
			setTrimEnd(nextStart + length)
			setTrimStart(nextStart)
			return
		}
		setTrimStart(nextStart)
		setTrimEnd(nextStart + length)
	}

	const handleRangeMove = (event: PointerEvent) => {
		if (rangeDrag === null) return
		const deltaX = event.clientX - rangeDrag.startX
		const deltaSeconds = (deltaX / ruler.clientWidth) * timeline.view.span
		if (rangeDrag.kind === 'start') return setTrimStart(rangeDrag.startTrimStart + deltaSeconds)
		if (rangeDrag.kind === 'end') return setTrimEnd(rangeDrag.startTrimEnd + deltaSeconds)
		moveWholeRange(deltaSeconds, rangeDrag)
	}

	const handleRangeUp = () => {
		rangeDrag = null
	}

	const handleRangeDoubleClick = (event: MouseEvent) => {
		event.stopPropagation()
		setTrimStart(0)
		setTrimEnd(app.duration)
	}

	const handleStartKey = (event: KeyboardEvent) => {
		const isRight = event.key === 'ArrowRight'
		const isLeft = event.key === 'ArrowLeft'
		if (!isRight && !isLeft) return
		event.preventDefault()
		event.stopPropagation()
		const direction = isRight ? 1 : -1
		setTrimStart(app.trimStart + direction * RANGE_KEY_SECONDS)
	}

	const handleEndKey = (event: KeyboardEvent) => {
		const isRight = event.key === 'ArrowRight'
		const isLeft = event.key === 'ArrowLeft'
		if (!isRight && !isLeft) return
		event.preventDefault()
		event.stopPropagation()
		const direction = isRight ? 1 : -1
		setTrimEnd(app.trimEnd + direction * RANGE_KEY_SECONDS)
	}
</script>

<div
	class="time-ruler"
	bind:this={ruler}
	data-track="ruler"
	role="presentation"
	onpointerdown={handleRulerDown}
	onpointermove={handleRulerMove}
	onpointerup={handleRulerUp}
	onpointercancel={handleRulerUp}
>
	{#each props.grid.lines as line (line.time)}
		<div class="time-ruler-tick" class:isLabel={line.kind === 'label'} class:isBar={line.kind === 'bar'} class:isBeat={line.kind === 'beat'} class:isSub={line.kind === 'sub'} style:--ruler-x="{getLinePercent(line)}%">
			{#if line.label !== null}
				<span class="time-ruler-label">{line.label}</span>
			{/if}
		</div>
	{/each}

	<div class="time-ruler-range-strip">
		<div
			class="time-ruler-range"
			class:isFull={isFullRange}
			class:isDisabled={!canEditRange}
			style:--ruler-x="{rangeStartPercent}%"
			style:--ruler-width="{rangeWidthPercent}%"
			role="presentation"
			title="Export range · drag to move, double-click to reset"
			onpointerdown={(event) => handleRangeDown(event, 'move')}
			onpointermove={handleRangeMove}
			onpointerup={handleRangeUp}
			onpointercancel={handleRangeUp}
			ondblclick={handleRangeDoubleClick}
		>
			<div
				class="time-ruler-grip isStart"
				role="slider"
				tabindex={canEditRange ? 0 : -1}
				aria-label="Export start"
				aria-valuemin={0}
				aria-valuemax={Math.round(app.trimEnd)}
				aria-valuenow={Math.round(app.trimStart)}
				aria-valuetext={rangeStartText}
				onpointerdown={(event) => handleRangeDown(event, 'start')}
				onpointermove={handleRangeMove}
				onpointerup={handleRangeUp}
				onpointercancel={handleRangeUp}
				onkeydown={handleStartKey}
			></div>
			<div
				class="time-ruler-grip isEnd"
				role="slider"
				tabindex={canEditRange ? 0 : -1}
				aria-label="Export end"
				aria-valuemin={Math.round(app.trimStart)}
				aria-valuemax={Math.round(app.duration)}
				aria-valuenow={Math.round(app.trimEnd)}
				aria-valuetext={rangeEndText}
				onpointerdown={(event) => handleRangeDown(event, 'end')}
				onpointermove={handleRangeMove}
				onpointerup={handleRangeUp}
				onpointercancel={handleRangeUp}
				onkeydown={handleEndKey}
			></div>
		</div>
	</div>

	{#if isMarkerShown}
		<div class="time-ruler-marker" style:--ruler-x="{markerPercent}%"></div>
	{/if}

	{#if isPlayheadVisible}
		<div class="time-ruler-playhead" style:--ruler-x="{playheadPercent}%"></div>
	{/if}

	{#if hasHover}
		<div class="time-ruler-hover" style:--ruler-x="{hoverPercent}%">
			<span class="time-ruler-hover-label">{hoverLabel}</span>
		</div>
	{/if}
</div>
