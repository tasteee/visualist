<script lang="ts">
	import { recordHistory } from '../automation.svelte'
	import { clamp } from '../engine/settings'
	import { MIN_CLIP_SECONDS } from '../engine/settings'
	import { formatPreciseTime, ratioToTime, snapToGrid, timeToPercent } from '../engine/timeline'
	import type { TimelineGridT } from '../engine/timeline'
	import type { LayerT } from '../engine/types'
	import { layerStore } from '../layers.svelte'
	import { pickLayer, readModifiers } from '../selection.svelte'
	import { app, getAudioLayerBuffer, getAudioLayerPeaks, seekTo } from '../store.svelte'
	import { timeline } from '../timeline.svelte'
	import './AudioClip.css'

	// An audio layer on the timeline, like a clip in Ableton. The bar
	// along its top selects it and drags it along the timeline. Its
	// left and right edges trim where the sound starts and ends. The
	// picture inside is the waveform of the part that plays.
	type AudioClipPropsT = {
		layer: LayerT
		grid: TimelineGridT
		isSelected: boolean
	}

	type DragModeT = 'move' | 'start' | 'end'

	type ClipDragT = {
		mode: DragModeT
		grabOffset: number
		startX: number
		hasMoved: boolean
	}

	const props: AudioClipPropsT = $props()

	const MOVE_THRESHOLD_PX = 3
	const BAR_WIDTH = 2
	const BAR_PITCH = 3
	const MIN_BAR_HALF = 0.5

	let root: HTMLDivElement
	let wave: HTMLDivElement
	let canvas: HTMLCanvasElement
	let drag = $state<ClipDragT | null>(null)
	let pixelWidth = $state(0)
	let pixelHeight = $state(0)

	const view = $derived(timeline.view)
	const buffer = $derived(getAudioLayerBuffer(props.layer.id))
	const fileLength = $derived(buffer === undefined ? 0 : buffer.duration)
	const startTime = $derived(props.layer.startTime)
	const offset = $derived(props.layer.sourceOffset)
	// Where the sound ends if it is never cut short.
	const naturalEnd = $derived(startTime + Math.max(0, fileLength - offset))
	const endTime = $derived(props.layer.endTime ?? naturalEnd)
	const leftPercent = $derived(timeToPercent(startTime, view))
	const rightPercent = $derived(100 - timeToPercent(endTime, view))
	const isMuted = $derived(!props.layer.isVisible)
	const isDragging = $derived(drag !== null)
	const rangeLabel = $derived(`${formatPreciseTime(startTime)} – ${formatPreciseTime(endTime)}`)

	const readTime = (event: PointerEvent): number => {
		const track = root.closest<HTMLElement>('[data-track]')
		if (track === null) return 0
		const bounds = track.getBoundingClientRect()
		const ratio = (event.clientX - bounds.left) / bounds.width
		return clamp(ratioToTime(ratio, view), 0, app.duration)
	}

	const snapTime = (time: number, event: PointerEvent): number => {
		const shouldSnap = timeline.isSnapping && !event.shiftKey
		if (!shouldSnap) return time
		return Math.max(0, snapToGrid(time, props.grid))
	}

	const handleDown = (event: PointerEvent, mode: DragModeT) => {
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		event.stopPropagation()
		root.setPointerCapture(event.pointerId)
		const orderedIds = [...layerStore.layers].reverse().map((candidate) => candidate.id)
		pickLayer(props.layer.id, orderedIds, readModifiers(event))
		drag = { mode, grabOffset: readTime(event) - startTime, startX: event.clientX, hasMoved: false }
	}

	// A click on the waveform selects the clip and puts the playhead
	// at that point in it, ready to slice.
	const handleBodyDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		event.stopPropagation()
		const orderedIds = [...layerStore.layers].reverse().map((candidate) => candidate.id)
		pickLayer(props.layer.id, orderedIds, readModifiers(event))
		const rawTime = readTime(event)
		const shouldSnap = timeline.isSnapping && !event.shiftKey
		seekTo(shouldSnap ? snapToGrid(rawTime, props.grid) : rawTime)
	}

	const moveClip = (event: PointerEvent, activeDrag: ClipDragT) => {
		const length = endTime - startTime
		const rawStart = Math.max(0, readTime(event) - activeDrag.grabOffset)
		const nextStart = snapTime(rawStart, event)
		props.layer.startTime = nextStart
		const hasCut = props.layer.endTime !== null
		if (hasCut) props.layer.endTime = nextStart + length
	}

	// Trimming the start moves where in the file the clip begins, so
	// the sound stays where it was on the timeline.
	const trimStart = (event: PointerEvent) => {
		const earliest = startTime - offset
		const latest = endTime - MIN_CLIP_SECONDS
		const nextStart = clamp(snapTime(readTime(event), event), Math.max(0, earliest), latest)
		const shift = nextStart - startTime
		props.layer.sourceOffset = Math.max(0, offset + shift)
		props.layer.startTime = nextStart
	}

	const trimEnd = (event: PointerEvent) => {
		const nextEnd = clamp(snapTime(readTime(event), event), startTime + MIN_CLIP_SECONDS, naturalEnd)
		const isAtNaturalEnd = nextEnd >= naturalEnd - 0.005
		props.layer.endTime = isAtNaturalEnd ? null : nextEnd
	}

	const handleMove = (event: PointerEvent) => {
		const activeDrag = drag
		if (activeDrag === null) return
		const travel = Math.abs(event.clientX - activeDrag.startX)
		const hasStarted = activeDrag.hasMoved || travel >= MOVE_THRESHOLD_PX
		if (!hasStarted) return
		// One undo step per drag, recorded when it really moves.
		if (!activeDrag.hasMoved) recordHistory()
		activeDrag.hasMoved = true
		if (activeDrag.mode === 'move') return moveClip(event, activeDrag)
		if (activeDrag.mode === 'start') return trimStart(event)
		trimEnd(event)
	}

	const handleUp = () => {
		drag = null
	}

	// ---- Waveform ------------------------------------------

	const draw = () => {
		const peaks = getAudioLayerPeaks(props.layer.id)
		const hasSize = canvas !== undefined && pixelWidth > 0 && pixelHeight > 0
		if (!hasSize) return
		const context = canvas.getContext('2d')
		if (context === null) return
		const ratio = window.devicePixelRatio || 1
		canvas.width = Math.round(pixelWidth * ratio)
		canvas.height = Math.round(pixelHeight * ratio)
		context.setTransform(ratio, 0, 0, ratio, 0, 0)
		context.clearRect(0, 0, pixelWidth, pixelHeight)
		if (peaks === undefined) return
		const color = getComputedStyle(canvas).color
		context.fillStyle = color
		const clipLength = Math.max(0.001, endTime - startTime)
		const middle = pixelHeight / 2
		const maxHalf = middle - 1
		const barCount = Math.ceil(pixelWidth / BAR_PITCH)
		for (let barIndex = 0; barIndex < barCount; barIndex++) {
			const x = barIndex * BAR_PITCH
			const fromFraction = x / pixelWidth
			const toFraction = (x + BAR_PITCH) / pixelWidth
			const fileFrom = offset + fromFraction * clipLength
			const fileTo = offset + toFraction * clipLength
			const firstSlice = Math.floor(fileFrom * peaks.perSecond)
			const lastSlice = Math.max(firstSlice + 1, Math.ceil(fileTo * peaks.perSecond))
			let peak = 0
			for (let slice = firstSlice; slice < lastSlice; slice++) peak = Math.max(peak, peaks.values[slice] ?? 0)
			const half = Math.max(MIN_BAR_HALF, Math.min(1, peak) * maxHalf)
			context.fillRect(x, middle - half, BAR_WIDTH, half * 2)
		}
	}

	$effect(() => {
		void startTime
		void endTime
		void offset
		void pixelWidth
		void pixelHeight
		void buffer
		void isMuted
		draw()
	})

	$effect(() => {
		const observer = new ResizeObserver(() => {
			pixelWidth = wave.clientWidth
			pixelHeight = wave.clientHeight
		})
		observer.observe(wave)
		return () => observer.disconnect()
	})
</script>

<div
	class="audio-clip"
	class:isSelected={props.isSelected}
	class:isMuted
	class:isDragging
	bind:this={root}
	style:--clip-left="{leftPercent}%"
	style:--clip-right="{rightPercent}%"
	role="group"
	aria-label="{props.layer.name} plays {rangeLabel}"
	onpointermove={handleMove}
	onpointerup={handleUp}
	onpointercancel={handleUp}
>
	<div class="audio-clip-bar" data-clip-control role="presentation" title="{props.layer.name} · {rangeLabel} · drag to move" onpointerdown={(event) => handleDown(event, 'move')}>
		<span class="audio-clip-name">{props.layer.name}</span>
		{#if isDragging}
			<span class="audio-clip-range">{rangeLabel}</span>
		{/if}
	</div>
	<div class="audio-clip-wave" data-clip-control role="presentation" bind:this={wave} onpointerdown={handleBodyDown}>
		<canvas class="audio-clip-canvas" bind:this={canvas}></canvas>
	</div>
	<span class="audio-clip-edge isStart" data-clip-control role="presentation" onpointerdown={(event) => handleDown(event, 'start')}></span>
	<span class="audio-clip-edge isEnd" data-clip-control role="presentation" onpointerdown={(event) => handleDown(event, 'end')}></span>
</div>
