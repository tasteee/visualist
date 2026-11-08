<script lang="ts">
	import { recordHistory } from '../automation.svelte'
	import { clamp, MIN_CLIP_SECONDS } from '../engine/settings'
	import { checkIsTimeVisible, formatPreciseTime, panView, ratioToTime, snapToGrid, timeToPercent, zoomView } from '../engine/timeline'
	import type { GridLineT, TimelineGridT, TimelineViewT } from '../engine/timeline'
	import { app, seekTo, setLoopEnabled, setLoopRegion } from '../store.svelte'
	import { clearSelection } from '../selection.svelte'
	import { setTrackWidth, setViewRange, timeline } from '../timeline.svelte'
	import './TimeRuler.css'

	type TimeRulerPropsT = {
		grid: TimelineGridT
	}

	// A press on the tick area. A click seeks. A drag zooms and
	// scrolls. A press that follows a click closely draws a
	// loop region instead, and then the view never moves.
	type RulerDragT = {
		mode: 'view' | 'draw'
		startX: number
		startY: number
		startView: TimelineViewT
		anchorTime: number
		hasMoved: boolean
	}

	type LoopDragModeT = 'start' | 'end' | 'move'

	type LoopDragT = {
		mode: LoopDragModeT
		startX: number
		startRegionStart: number
		startRegionEnd: number
		hasMoved: boolean
	}

	type RegionT = {
		start: number
		end: number
	}

	const props: TimeRulerPropsT = $props()

	const DRAG_THRESHOLD_PX = 3
	const ZOOM_PER_PIXEL = 0.012
	const RANGE_KEY_SECONDS = 1
	const DOUBLE_PRESS_MS = 400
	const DOUBLE_PRESS_PX = 8

	let ruler: HTMLDivElement
	let rulerDrag: RulerDragT | null = null
	let loopDrag: LoopDragT | null = null
	let lastClickAt = 0
	let lastClickX = 0
	let drawPreview = $state<RegionT | null>(null)

	const canEdit = $derived(app.hasAudio && !app.isRecording)

	const loopRegion = $derived<RegionT>(drawPreview ?? { start: app.loopStart, end: app.loopEnd })

	const loopStartPercent = $derived(timeToPercent(loopRegion.start, timeline.view))
	const loopWidthPercent = $derived(timeToPercent(loopRegion.end, timeline.view) - loopStartPercent)
	const isLoopOn = $derived(app.isLoopEnabled)

	const loopBarLength = $derived(props.grid.beatLength * 4)
	const loopBarsValue = $derived(loopBarLength > 0 ? Math.round(((loopRegion.end - loopRegion.start) / loopBarLength) * 4) / 4 : 0)
	const loopBarsLabel = $derived(loopBarsValue === 1 ? '1 bar' : `${loopBarsValue} bars`)
	const loopDetail = $derived(`${loopBarsLabel} · ${formatPreciseTime(loopRegion.start)} – ${formatPreciseTime(loopRegion.end)}`)
	const loopTitle = $derived(`Loop ${isLoopOn ? 'on' : 'off'} · ${loopDetail} · click to toggle, drag to move`)
	const loopStartText = $derived(`Loop starts at ${formatPreciseTime(app.loopStart)}`)
	const loopEndText = $derived(`Loop ends at ${formatPreciseTime(app.loopEnd)}`)

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

	const readPointerTime = (event: PointerEvent): number => clamp(ratioToTime(readPointerRatio(event), timeline.view), 0, app.duration)

	// Snap on: times land on the grid, and Shift moves freely.
	const snapTime = (time: number, event: PointerEvent): number => {
		const shouldSnap = timeline.isSnapping && !event.shiftKey
		if (!shouldSnap) return time
		return clamp(snapToGrid(time, props.grid), 0, app.duration)
	}

	// ---- Tick area -----------------------------------------

	const checkIsSecondPress = (event: PointerEvent): boolean => {
		const elapsed = performance.now() - lastClickAt
		const travel = Math.abs(event.clientX - lastClickX)
		return elapsed < DOUBLE_PRESS_MS && travel < DOUBLE_PRESS_PX
	}

	const handleRulerDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		ruler.setPointerCapture(event.pointerId)
		const isDrawing = canEdit && checkIsSecondPress(event)
		rulerDrag = {
			mode: isDrawing ? 'draw' : 'view',
			startX: event.clientX,
			startY: event.clientY,
			startView: { ...timeline.view },
			anchorTime: readPointerTime(event),
			hasMoved: false
		}
	}

	const drawRegion = (event: PointerEvent, drag: RulerDragT) => {
		const anchor = snapTime(drag.anchorTime, event)
		const current = snapTime(readPointerTime(event), event)
		const start = Math.min(anchor, current)
		const end = Math.max(anchor, current)
		const hasRoom = end - start >= MIN_CLIP_SECONDS
		if (!hasRoom) return
		drawPreview = { start, end }
	}

	// Ableton-style: drag up and down to zoom around the grabbed
	// spot, left and right to scroll.
	const moveView = (event: PointerEvent, drag: RulerDragT) => {
		const deltaX = event.clientX - drag.startX
		const deltaY = event.clientY - drag.startY
		const zoomFactor = Math.exp(-deltaY * ZOOM_PER_PIXEL)
		const zoomed = zoomView(drag.startView, zoomFactor, drag.anchorTime, app.duration)
		const panSeconds = (-deltaX / ruler.clientWidth) * zoomed.span
		const panned = panView(zoomed, panSeconds, app.duration)
		setViewRange(panned.start, panned.start + panned.span)
	}

	const handleRulerMove = (event: PointerEvent) => {
		const drag = rulerDrag
		if (drag === null) return
		const deltaX = event.clientX - drag.startX
		const deltaY = event.clientY - drag.startY
		const travel = Math.abs(deltaX) + Math.abs(deltaY)
		const isPastThreshold = travel > DRAG_THRESHOLD_PX
		if (isPastThreshold) drag.hasMoved = true
		if (!drag.hasMoved) return
		if (drag.mode === 'draw') return drawRegion(event, drag)
		moveView(event, drag)
	}

	const commitDrawnRegion = () => {
		const preview = drawPreview
		drawPreview = null
		if (preview === null) return
		recordHistory()
		setLoopRegion(preview.start, preview.end)
		setLoopEnabled(true)
	}

	const handleRulerUp = (event: PointerEvent) => {
		const drag = rulerDrag
		rulerDrag = null
		if (drag === null) return
		const isDrawing = drag.mode === 'draw'
		if (isDrawing && drag.hasMoved) return commitDrawnRegion()
		if (isDrawing) return
		if (drag.hasMoved) return
		lastClickAt = performance.now()
		lastClickX = event.clientX
		clearSelection()
		seekTo(snapTime(readPointerTime(event), event))
	}

	const handleRulerCancel = () => {
		rulerDrag = null
		drawPreview = null
	}

	// ---- Loop bar ------------------------------------------

	const handleLoopDown = (event: PointerEvent, mode: LoopDragModeT) => {
		event.stopPropagation()
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton || !canEdit) return
		const target = event.currentTarget as HTMLElement
		target.setPointerCapture(event.pointerId)
		loopDrag = { mode, startX: event.clientX, startRegionStart: app.loopStart, startRegionEnd: app.loopEnd, hasMoved: false }
	}

	const computeResizedLoop = (drag: LoopDragT, deltaSeconds: number, event: PointerEvent): RegionT => {
		const latestStart = drag.startRegionEnd - MIN_CLIP_SECONDS
		const earliestEnd = drag.startRegionStart + MIN_CLIP_SECONDS
		if (drag.mode === 'start') {
			const rawStart = clamp(drag.startRegionStart + deltaSeconds, 0, latestStart)
			return { start: snapTime(rawStart, event), end: drag.startRegionEnd }
		}
		const rawEnd = clamp(drag.startRegionEnd + deltaSeconds, earliestEnd, app.duration)
		return { start: drag.startRegionStart, end: snapTime(rawEnd, event) }
	}

	const computeMovedLoop = (drag: LoopDragT, deltaSeconds: number, event: PointerEvent): RegionT => {
		const length = drag.startRegionEnd - drag.startRegionStart
		const latestStart = Math.max(0, app.duration - length)
		const rawStart = clamp(drag.startRegionStart + deltaSeconds, 0, latestStart)
		const snappedStart = clamp(snapTime(rawStart, event), 0, latestStart)
		return { start: snappedStart, end: snappedStart + length }
	}

	const handleLoopMove = (event: PointerEvent) => {
		const drag = loopDrag
		if (drag === null) return
		const deltaX = event.clientX - drag.startX
		const isPastThreshold = Math.abs(deltaX) > DRAG_THRESHOLD_PX
		const shouldStart = drag.hasMoved || isPastThreshold
		if (!shouldStart) return
		if (!drag.hasMoved) recordHistory()
		drag.hasMoved = true
		const deltaSeconds = (deltaX / ruler.clientWidth) * timeline.view.span
		const isMove = drag.mode === 'move'
		const region = isMove ? computeMovedLoop(drag, deltaSeconds, event) : computeResizedLoop(drag, deltaSeconds, event)
		setLoopRegion(region.start, region.end)
	}

	// A click on the loop bar, with no drag, switches the loop.
	const handleLoopUp = () => {
		const drag = loopDrag
		loopDrag = null
		if (drag === null) return
		if (drag.hasMoved) return
		recordHistory()
		setLoopEnabled(!app.isLoopEnabled)
	}

	const handleLoopCancel = () => {
		loopDrag = null
	}

	const handleGripKey = (event: KeyboardEvent, mode: 'start' | 'end') => {
		const isRight = event.key === 'ArrowRight'
		const isLeft = event.key === 'ArrowLeft'
		if (!isRight && !isLeft) return
		event.preventDefault()
		event.stopPropagation()
		const direction = isRight ? 1 : -1
		recordHistory()
		const delta = direction * RANGE_KEY_SECONDS
		if (mode === 'start') return setLoopRegion(clamp(app.loopStart + delta, 0, app.loopEnd - MIN_CLIP_SECONDS), app.loopEnd)
		setLoopRegion(app.loopStart, clamp(app.loopEnd + delta, app.loopStart + MIN_CLIP_SECONDS, app.duration))
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
	onpointercancel={handleRulerCancel}
>
	{#each props.grid.lines as line (line.time)}
		<div class="time-ruler-tick" class:isLabel={line.kind === 'label'} class:isBar={line.kind === 'bar'} class:isBeat={line.kind === 'beat'} class:isSub={line.kind === 'sub'} style:--ruler-x="{getLinePercent(line)}%">
			{#if line.label !== null}
				<span class="time-ruler-label">{line.label}</span>
			{/if}
		</div>
	{/each}

	<div class="time-ruler-bars">
		<div class="time-ruler-lane isLoop">
			<div
				class="time-ruler-bar isLoop"
				class:isOn={isLoopOn}
				class:isDisabled={!canEdit}
				style:--ruler-x="{loopStartPercent}%"
				style:--ruler-width="{loopWidthPercent}%"
				role="presentation"
				title={loopTitle}
				onpointerdown={(event) => handleLoopDown(event, 'move')}
				onpointermove={handleLoopMove}
				onpointerup={handleLoopUp}
				onpointercancel={handleLoopCancel}
			>
				<span class="time-ruler-bar-name">Loop</span>
				<span class="time-ruler-bar-detail">{loopDetail}</span>
				<div
					class="time-ruler-grip isStart"
					role="slider"
					tabindex={canEdit ? 0 : -1}
					aria-label="Loop start"
					aria-valuemin={0}
					aria-valuemax={Math.round(app.loopEnd)}
					aria-valuenow={Math.round(app.loopStart)}
					aria-valuetext={loopStartText}
					onpointerdown={(event) => handleLoopDown(event, 'start')}
					onpointermove={handleLoopMove}
					onpointerup={handleLoopUp}
					onpointercancel={handleLoopCancel}
					onkeydown={(event) => handleGripKey(event, 'start')}
				></div>
				<div
					class="time-ruler-grip isEnd"
					role="slider"
					tabindex={canEdit ? 0 : -1}
					aria-label="Loop end"
					aria-valuemin={Math.round(app.loopStart)}
					aria-valuemax={Math.round(app.duration)}
					aria-valuenow={Math.round(app.loopEnd)}
					aria-valuetext={loopEndText}
					onpointerdown={(event) => handleLoopDown(event, 'end')}
					onpointermove={handleLoopMove}
					onpointerup={handleLoopUp}
					onpointercancel={handleLoopCancel}
					onkeydown={(event) => handleGripKey(event, 'end')}
				></div>
			</div>
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
