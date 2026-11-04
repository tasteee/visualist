<script lang="ts">
	import { clamp } from '../engine/settings'
	import { checkIsTimeVisible, formatPreciseTime, ratioToTime, timeToPercent } from '../engine/timeline'
	import { readPeak } from '../engine/peaks'
	import { app, getAnalysis, seekTo } from '../store.svelte'
	import { timeline } from '../timeline.svelte'
	import './WaveformTrack.css'

	const BAR_WIDTH = 2
	const BAR_PITCH = 3
	const MIN_BAR_HALF = 0.75
	const KEY_SEEK_SECONDS = 5

	type WaveColorsT = { idle: string; played: string; outside: string }

	let canvas: HTMLCanvasElement
	let wrapper: HTMLDivElement
	let pixelWidth = $state(0)
	let pixelHeight = $state(0)

	const duration = $derived(app.duration)
	const valueText = $derived(`${formatPreciseTime(app.currentTime)} of ${formatPreciseTime(duration)}`)
	const playheadPercent = $derived(timeToPercent(app.currentTime, timeline.view))
	const isPlayheadVisible = $derived(checkIsTimeVisible(app.currentTime, timeline.view))
	const hoverTime = $derived(timeline.hoverTime)
	const hasHover = $derived(hoverTime !== null && checkIsTimeVisible(hoverTime, timeline.view))
	const hoverPercent = $derived(hoverTime === null ? 0 : timeToPercent(hoverTime, timeline.view))

	// Colors come from CSS so the canvas follows the tokens.
	const readColors = (): WaveColorsT => {
		const style = getComputedStyle(canvas)
		return { idle: style.color, played: style.caretColor, outside: style.borderTopColor }
	}

	type BarInputT = {
		context: CanvasRenderingContext2D
		colors: WaveColorsT
		barIndex: number
	}

	const pickBarColor = (colors: WaveColorsT, startTime: number): string => {
		const isOutsideRange = startTime < app.trimStart || startTime >= app.trimEnd
		if (isOutsideRange) return colors.outside
		const isPlayed = startTime < app.currentTime
		return isPlayed ? colors.played : colors.idle
	}

	const drawBar = (input: BarInputT) => {
		const x = input.barIndex * BAR_PITCH
		const startTime = ratioToTime(x / pixelWidth, timeline.view)
		const endTime = ratioToTime((x + BAR_PITCH) / pixelWidth, timeline.view)
		const isInSong = endTime > 0 && startTime < duration
		if (!isInSong) return
		const middle = pixelHeight / 2
		const maxHalf = middle - 2
		const peak = readPeak(getAnalysis(), startTime, endTime)
		const half = Math.max(MIN_BAR_HALF, peak * maxHalf)
		input.context.fillStyle = pickBarColor(input.colors, startTime)
		input.context.fillRect(x, middle - half, BAR_WIDTH, half * 2)
	}

	const draw = () => {
		const hasSize = canvas !== undefined && pixelWidth > 0
		if (!hasSize) return
		const context = canvas.getContext('2d')
		if (context === null) return
		const ratio = window.devicePixelRatio || 1
		canvas.width = Math.round(pixelWidth * ratio)
		canvas.height = Math.round(pixelHeight * ratio)
		context.setTransform(ratio, 0, 0, ratio, 0, 0)
		context.clearRect(0, 0, pixelWidth, pixelHeight)
		const colors = readColors()
		const barCount = Math.ceil(pixelWidth / BAR_PITCH)
		const barIndexes = Array.from({ length: barCount }, (_, index) => index)
		for (const barIndex of barIndexes) drawBar({ context, colors, barIndex })
	}

	$effect(() => {
		void timeline.view
		void app.currentTime
		void app.trimStart
		void app.trimEnd
		void pixelWidth
		void pixelHeight
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

	const seekFromPointer = (event: PointerEvent) => {
		const bounds = wrapper.getBoundingClientRect()
		const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
		seekTo(ratioToTime(ratio, timeline.view))
	}

	const handlePointerDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		const canSeek = duration > 0 && isPrimaryButton
		if (!canSeek) return
		wrapper.setPointerCapture(event.pointerId)
		seekFromPointer(event)
	}

	const handlePointerMove = (event: PointerEvent) => {
		const isDragging = wrapper.hasPointerCapture(event.pointerId)
		if (isDragging) seekFromPointer(event)
	}

	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'ArrowRight') seekTo(app.currentTime + KEY_SEEK_SECONDS)
		if (event.key === 'ArrowLeft') seekTo(app.currentTime - KEY_SEEK_SECONDS)
	}
</script>

<div
	class="waveform-track"
	class:isDisabled={app.isRecording}
	bind:this={wrapper}
	data-track="wave"
	role="slider"
	tabindex="0"
	aria-label="Seek"
	aria-valuemin={0}
	aria-valuemax={Math.round(duration)}
	aria-valuenow={Math.round(app.currentTime)}
	aria-valuetext={valueText}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onkeydown={handleKeyDown}
>
	<canvas class="waveform-track-canvas" bind:this={canvas}></canvas>
	{#if hasHover}
		<div class="waveform-track-hover" style:--wave-x="{hoverPercent}%"></div>
	{/if}
	{#if isPlayheadVisible}
		<div class="waveform-track-playhead" style:--wave-x="{playheadPercent}%"></div>
	{/if}
</div>
