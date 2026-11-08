<script lang="ts">
	import { recordHistory } from '../automation.svelte'
	import { clamp, MIN_CLIP_SECONDS } from '../engine/settings'
	import { formatPreciseTime, getViewEnd, MIN_VIEW_SPAN, snapToGrid, timeToPercent } from '../engine/timeline'
	import type { TimelineGridT, TimelineViewT } from '../engine/timeline'
	import { readPeak } from '../engine/peaks'
	import { app, getAnalysis, setTrimEnd, setTrimStart } from '../store.svelte'
	import { fitView, setViewRange, setViewStart, timeline } from '../timeline.svelte'
	import './OverviewBar.css'

	type OverviewBarPropsT = {
		grid: TimelineGridT
	}

	type WindowDragKindT = 'move' | 'start' | 'end'

	type WindowDragT = {
		kind: WindowDragKindT
		startX: number
		startView: TimelineViewT
	}

	type ExportDragModeT = 'start' | 'end' | 'move'

	type ExportDragT = {
		mode: ExportDragModeT
		startX: number
		startRegionStart: number
		startRegionEnd: number
		hasMoved: boolean
	}

	const props: OverviewBarPropsT = $props()

	const BAR_WIDTH = 1
	const BAR_PITCH = 2
	const DRAG_THRESHOLD_PX = 3
	const RANGE_KEY_SECONDS = 1

	let canvas: HTMLCanvasElement
	let wrapper: HTMLDivElement
	let exportLane: HTMLDivElement
	let pixelWidth = $state(0)
	let pixelHeight = $state(0)
	let windowDrag: WindowDragT | null = null
	let exportDrag: ExportDragT | null = null

	const canEdit = $derived(app.hasAudio && !app.isRecording)
	const duration = $derived(app.duration)
	const toPercent = (time: number): number => (duration > 0 ? (time / duration) * 100 : 0)
	const windowLeft = $derived(toPercent(timeline.view.start))
	const windowWidth = $derived(toPercent(timeline.view.span))
	const playheadPercent = $derived(toPercent(app.currentTime))
	const rangeStartPercent = $derived(toPercent(app.trimStart))
	const rangeEndInset = $derived(100 - toPercent(app.trimEnd))

	const exportStartPercent = $derived(timeToPercent(app.trimStart, timeline.view))
	const exportWidthPercent = $derived(timeToPercent(app.trimEnd, timeline.view) - exportStartPercent)
	const isFullExport = $derived(app.trimStart <= 0.001 && app.trimEnd >= app.duration - 0.001)
	const exportDetail = $derived(`${formatPreciseTime(app.trimStart)} – ${formatPreciseTime(app.trimEnd)}`)
	const exportTitle = $derived(`Export range · ${exportDetail} · drag to move, double-click to reset`)
	const exportStartText = $derived(`Export starts at ${formatPreciseTime(app.trimStart)}`)
	const exportEndText = $derived(`Export ends at ${formatPreciseTime(app.trimEnd)}`)

	const snapTime = (time: number, event: PointerEvent): number => {
		const shouldSnap = timeline.isSnapping && !event.shiftKey
		if (!shouldSnap) return time
		return clamp(snapToGrid(time, props.grid), 0, app.duration)
	}

	const writeExportRegion = (start: number, end: number) => {
		const length = end - start
		const isMovingRight = start > app.trimStart
		if (isMovingRight) {
			setTrimEnd(start + length)
			setTrimStart(start)
			return
		}
		setTrimStart(start)
		setTrimEnd(start + length)
	}

	const handleExportDown = (event: PointerEvent, mode: ExportDragModeT) => {
		event.stopPropagation()
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton || !canEdit) return
		const target = event.currentTarget as HTMLElement
		target.setPointerCapture(event.pointerId)
		exportDrag = { mode, startX: event.clientX, startRegionStart: app.trimStart, startRegionEnd: app.trimEnd, hasMoved: false }
	}

	const handleExportMove = (event: PointerEvent) => {
		const drag = exportDrag
		if (drag === null) return
		const deltaX = event.clientX - drag.startX
		const isPastThreshold = Math.abs(deltaX) > DRAG_THRESHOLD_PX
		const shouldStart = drag.hasMoved || isPastThreshold
		if (!shouldStart) return
		if (!drag.hasMoved) recordHistory()
		drag.hasMoved = true
		const laneWidth = Math.max(1, exportLane.clientWidth)
		const deltaSeconds = (deltaX / laneWidth) * timeline.view.span
		if (drag.mode === 'move') {
			const length = drag.startRegionEnd - drag.startRegionStart
			const latestStart = Math.max(0, app.duration - length)
			const rawStart = clamp(drag.startRegionStart + deltaSeconds, 0, latestStart)
			const snappedStart = clamp(snapTime(rawStart, event), 0, latestStart)
			writeExportRegion(snappedStart, snappedStart + length)
			return
		}
		if (drag.mode === 'start') {
			const latestStart = drag.startRegionEnd - MIN_CLIP_SECONDS
			const rawStart = clamp(drag.startRegionStart + deltaSeconds, 0, latestStart)
			writeExportRegion(snapTime(rawStart, event), drag.startRegionEnd)
			return
		}
		const earliestEnd = drag.startRegionStart + MIN_CLIP_SECONDS
		const rawEnd = clamp(drag.startRegionEnd + deltaSeconds, earliestEnd, app.duration)
		writeExportRegion(drag.startRegionStart, snapTime(rawEnd, event))
	}

	const handleExportUp = () => {
		exportDrag = null
	}

	const handleExportDoubleClick = (event: MouseEvent) => {
		event.stopPropagation()
		if (!canEdit) return
		recordHistory()
		setTrimStart(0)
		setTrimEnd(app.duration)
	}

	const handleExportGripKey = (event: KeyboardEvent, mode: 'start' | 'end') => {
		const isRight = event.key === 'ArrowRight'
		const isLeft = event.key === 'ArrowLeft'
		if (!isRight && !isLeft) return
		event.preventDefault()
		event.stopPropagation()
		const direction = isRight ? 1 : -1
		recordHistory()
		const delta = direction * RANGE_KEY_SECONDS
		if (mode === 'start') return writeExportRegion(clamp(app.trimStart + delta, 0, app.trimEnd - MIN_CLIP_SECONDS), app.trimEnd)
		writeExportRegion(app.trimStart, clamp(app.trimEnd + delta, app.trimStart + MIN_CLIP_SECONDS, app.duration))
	}

	const draw = () => {
		const hasSize = canvas !== undefined && pixelWidth > 0 && duration > 0
		if (!hasSize) return
		const context = canvas.getContext('2d')
		if (context === null) return
		const ratio = window.devicePixelRatio || 1
		canvas.width = Math.round(pixelWidth * ratio)
		canvas.height = Math.round(pixelHeight * ratio)
		context.setTransform(ratio, 0, 0, ratio, 0, 0)
		context.clearRect(0, 0, pixelWidth, pixelHeight)
		context.fillStyle = getComputedStyle(canvas).color
		const barCount = Math.ceil(pixelWidth / BAR_PITCH)
		const barIndexes = Array.from({ length: barCount }, (_, index) => index)
		const middle = pixelHeight / 2
		for (const barIndex of barIndexes) {
			const barX = barIndex * BAR_PITCH
			const startTime = (barX / pixelWidth) * duration
			const endTime = ((barX + BAR_PITCH) / pixelWidth) * duration
			const half = Math.max(0.5, readPeak(getAnalysis(), startTime, endTime) * (middle - 1))
			context.fillRect(barX, middle - half, BAR_WIDTH, half * 2)
		}
	}

	$effect(() => {
		void pixelWidth
		void pixelHeight
		void duration
		void getAnalysis()
		draw()
	})

	$effect(() => {
		const observer = new ResizeObserver(() => {
			pixelWidth = wrapper.clientWidth
			pixelHeight = wrapper.clientHeight
		})
		observer.observe(wrapper)
		return () => observer.disconnect()
	})

	const readPointerTime = (event: PointerEvent): number => {
		const bounds = wrapper.getBoundingClientRect()
		const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
		return ratio * duration
	}

	const startDrag = (event: PointerEvent, kind: WindowDragKindT) => {
		wrapper.setPointerCapture(event.pointerId)
		windowDrag = { kind, startX: event.clientX, startView: { ...timeline.view } }
	}

	// Clicking outside the window jumps it there, then keeps
	// dragging, so one gesture both jumps and fine-tunes.
	const handleTrackDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		const clickedTime = readPointerTime(event)
		setViewStart(clickedTime - timeline.view.span / 2)
		startDrag(event, 'move')
	}

	const handleWindowDown = (event: PointerEvent, kind: WindowDragKindT) => {
		event.stopPropagation()
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		startDrag(event, kind)
	}

	const handlePointerMove = (event: PointerEvent) => {
		if (windowDrag === null) return
		const deltaSeconds = ((event.clientX - windowDrag.startX) / wrapper.clientWidth) * duration
		const start = windowDrag.startView.start
		const end = getViewEnd(windowDrag.startView)
		if (windowDrag.kind === 'move') return setViewStart(start + deltaSeconds)
		if (windowDrag.kind === 'start') {
			const nextStart = clamp(start + deltaSeconds, 0, end - MIN_VIEW_SPAN)
			return setViewRange(nextStart, end)
		}
		const nextEnd = clamp(end + deltaSeconds, start + MIN_VIEW_SPAN, duration)
		setViewRange(start, nextEnd)
	}

	const handlePointerUp = () => {
		windowDrag = null
	}
</script>

<div class="overview-stack">
	<div class="overview-export-lane" bind:this={exportLane}>
		<div
			class="time-ruler-bar isExport"
			class:isFull={isFullExport}
			class:isDisabled={!canEdit}
			style:--ruler-x="{exportStartPercent}%"
			style:--ruler-width="{exportWidthPercent}%"
			role="presentation"
			title={exportTitle}
			onpointerdown={(event) => handleExportDown(event, 'move')}
			onpointermove={handleExportMove}
			onpointerup={handleExportUp}
			onpointercancel={handleExportUp}
			ondblclick={handleExportDoubleClick}
		>
			<span class="time-ruler-bar-name">Export</span>
			<span class="time-ruler-bar-detail">{exportDetail}</span>
			<div
				class="time-ruler-grip isStart"
				role="slider"
				tabindex={canEdit ? 0 : -1}
				aria-label="Export start"
				aria-valuemin={0}
				aria-valuemax={Math.round(app.trimEnd)}
				aria-valuenow={Math.round(app.trimStart)}
				aria-valuetext={exportStartText}
				onpointerdown={(event) => handleExportDown(event, 'start')}
				onpointermove={handleExportMove}
				onpointerup={handleExportUp}
				onpointercancel={handleExportUp}
				onkeydown={(event) => handleExportGripKey(event, 'start')}
			></div>
			<div
				class="time-ruler-grip isEnd"
				role="slider"
				tabindex={canEdit ? 0 : -1}
				aria-label="Export end"
				aria-valuemin={Math.round(app.trimStart)}
				aria-valuemax={Math.round(app.duration)}
				aria-valuenow={Math.round(app.trimEnd)}
				aria-valuetext={exportEndText}
				onpointerdown={(event) => handleExportDown(event, 'end')}
				onpointermove={handleExportMove}
				onpointerup={handleExportUp}
				onpointercancel={handleExportUp}
				onkeydown={(event) => handleExportGripKey(event, 'end')}
			></div>
		</div>
	</div>

	<div
		class="overview-bar"
		bind:this={wrapper}
		data-track="overview"
		role="scrollbar"
		tabindex="-1"
		aria-label="Song overview"
		aria-controls="editor-timeline"
		aria-orientation="horizontal"
		aria-valuemin={0}
		aria-valuemax={Math.round(duration)}
		aria-valuenow={Math.round(timeline.view.start)}
		onpointerdown={handleTrackDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointercancel={handlePointerUp}
		ondblclick={fitView}
	>
		<canvas class="overview-bar-canvas" bind:this={canvas}></canvas>
		<div class="overview-bar-shade isStart" style:--overview-size="{rangeStartPercent}%"></div>
		<div class="overview-bar-shade isEnd" style:--overview-size="{rangeEndInset}%"></div>
		<div class="overview-bar-playhead" style:--overview-x="{playheadPercent}%"></div>
		<div
			class="overview-bar-window"
			style:--overview-x="{windowLeft}%"
			style:--overview-size="{windowWidth}%"
			role="presentation"
			onpointerdown={(event) => handleWindowDown(event, 'move')}
		>
			<div class="overview-bar-edge isStart" role="presentation" onpointerdown={(event) => handleWindowDown(event, 'start')}></div>
			<div class="overview-bar-edge isEnd" role="presentation" onpointerdown={(event) => handleWindowDown(event, 'end')}></div>
		</div>
	</div>
</div>
