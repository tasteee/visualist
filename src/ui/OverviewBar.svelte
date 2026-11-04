<script lang="ts">
	import { clamp } from '../engine/settings'
	import { MIN_VIEW_SPAN, getViewEnd } from '../engine/timeline'
	import type { TimelineViewT } from '../engine/timeline'
	import { readPeak } from '../engine/peaks'
	import { app, getAnalysis } from '../store.svelte'
	import { fitView, setViewRange, setViewStart, timeline } from '../timeline.svelte'
	import './OverviewBar.css'

	type WindowDragKindT = 'move' | 'start' | 'end'

	type WindowDragT = {
		kind: WindowDragKindT
		startX: number
		startView: TimelineViewT
	}

	const BAR_WIDTH = 1
	const BAR_PITCH = 2

	let canvas: HTMLCanvasElement
	let wrapper: HTMLDivElement
	let pixelWidth = $state(0)
	let pixelHeight = $state(0)
	let windowDrag: WindowDragT | null = null

	const duration = $derived(app.duration)
	const toPercent = (time: number): number => (duration > 0 ? (time / duration) * 100 : 0)
	const windowLeft = $derived(toPercent(timeline.view.start))
	const windowWidth = $derived(toPercent(timeline.view.span))
	const playheadPercent = $derived(toPercent(app.currentTime))
	const rangeStartPercent = $derived(toPercent(app.trimStart))
	const rangeEndInset = $derived(100 - toPercent(app.trimEnd))

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
			const x = barIndex * BAR_PITCH
			const startTime = (x / pixelWidth) * duration
			const endTime = ((x + BAR_PITCH) / pixelWidth) * duration
			const half = Math.max(0.5, readPeak(getAnalysis(), startTime, endTime) * (middle - 1))
			context.fillRect(x, middle - half, BAR_WIDTH, half * 2)
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
