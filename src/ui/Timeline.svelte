<script lang="ts">
	import { app, getAnalysis, seekTo } from '../store.svelte'
	import './Timeline.css'

	const BAR_WIDTH = 3
	const BAR_GAP = 2
	const KEY_SEEK_SECONDS = 5

	let canvas: HTMLCanvasElement
	let wrapper: HTMLDivElement
	let pixelWidth = $state(0)
	let pixelHeight = $state(0)

	// Resolved colors are read back from CSS, so the canvas follows
	// the tokens. caret-color carries the played color.
	type TimelineColorsT = { idle: string; played: string }
	const readColors = (): TimelineColorsT => {
		const style = getComputedStyle(canvas)
		return { idle: style.color, played: style.caretColor }
	}

	// One height per bar: the louder of overall level and bass.
	const peaks = $derived.by(() => {
		const analysis = getAnalysis()
		const barCount = Math.max(1, Math.floor(pixelWidth / (BAR_WIDTH + BAR_GAP)))
		const result = new Float32Array(barCount)
		const framesPerBar = analysis.level.length / barCount
		for (let bar = 0; bar < barCount; bar++) {
			const start = Math.floor(bar * framesPerBar)
			const end = Math.max(start + 1, Math.floor((bar + 1) * framesPerBar))
			let peak = 0
			for (let frame = start; frame < end; frame++) peak = Math.max(peak, analysis.level[frame], analysis.low[frame])
			result[bar] = Math.min(1, peak)
		}
		return result
	})

	const duration = $derived(app.hasAudio ? app.duration : 0)
	const progress = $derived(duration > 0 ? app.currentTime / duration : 0)
	const valueText = $derived(`${Math.round(app.currentTime)} of ${Math.round(duration)} seconds`)

	const draw = () => {
		if (canvas === undefined || pixelWidth === 0) return
		const context = canvas.getContext('2d')
		if (context === null) return
		const colors = readColors()
		const ratio = window.devicePixelRatio || 1
		canvas.width = Math.round(pixelWidth * ratio)
		canvas.height = Math.round(pixelHeight * ratio)
		context.setTransform(ratio, 0, 0, ratio, 0, 0)
		context.clearRect(0, 0, pixelWidth, pixelHeight)

		if (!app.hasAudio) return

		const middle = pixelHeight / 2
		const maxHalf = middle - 2
		const playedBars = progress * peaks.length
		for (let bar = 0; bar < peaks.length; bar++) {
			const half = Math.max(1.5, peaks[bar] * maxHalf)
			const isPlayed = bar < playedBars
			context.fillStyle = isPlayed ? colors.played : colors.idle
			const x = bar * (BAR_WIDTH + BAR_GAP)
			context.fillRect(x, middle - half, BAR_WIDTH, half * 2)
		}
	}

	$effect(() => {
		void peaks
		void progress
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
		const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
		seekTo(ratio * duration)
	}

	const handlePointerDown = (event: PointerEvent) => {
		if (duration === 0) return
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
		if (event.key === 'Home') seekTo(0)
		if (event.key === 'End') seekTo(duration)
	}
</script>

<div
	class="timeline"
	class:isDisabled={!app.hasAudio || app.isRecording}
	bind:this={wrapper}
	role="slider"
	tabindex={app.hasAudio ? 0 : -1}
	aria-label="Seek"
	aria-valuemin={0}
	aria-valuemax={Math.round(duration)}
	aria-valuenow={Math.round(app.currentTime)}
	aria-valuetext={valueText}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onkeydown={handleKeyDown}
>
	<canvas class="timeline-canvas" bind:this={canvas}></canvas>
	{#if !app.hasAudio}
		<span class="timeline-empty">Load a song to see its shape</span>
	{/if}
</div>
