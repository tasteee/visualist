<script lang="ts">
	import { onMount } from 'svelte'
	import {
		checkIsStageReset,
		resetStageView,
		setStageZoom,
		stageView,
		zoomStageAt
	} from '../stage.svelte'
	import { uiState } from '../uiState.svelte'
	import { app, attachCanvas, getOutputSize } from '../store.svelte'
	import './Stage.css'

	// Dragging on the stage viewport pans the view; wheel and pinch zoom it.
	// Layers and clips are controlled exclusively via their Inspector properties.
	type StageDragT = {
		startX: number
		startY: number
		startPanX: number
		startPanY: number
		hasMoved: boolean
	}

	const WHEEL_ZOOM_RATE = 0.0016
	const PINCH_ZOOM_RATE = 0.01
	const WHEEL_LINE_PX = 16
	const DRAG_THRESHOLD_PX = 3

	let canvas: HTMLCanvasElement
	let viewport: HTMLDivElement
	let frameElement: HTMLDivElement
	let drag: StageDragT | null = null
	let isPanning = $state(false)
	// The frame's width when fitted, in px. It follows the top pane.
	let fitWidth = $state(0)

	const analysisPercent = $derived(Math.round(app.analysisProgress * 100))
	const recordPercent = $derived(Math.round(app.recordProgress * 100))
	const isVertical = $derived(app.settings.aspectRatio === '9:16')
	const isSquare = $derived(app.settings.aspectRatio === '1:1')
	const isPortrait = $derived(app.settings.aspectRatio === '4:5')
	const isViewReset = $derived(checkIsStageReset())
	const ZOOM_PERCENTS = [25, 50, 100, 200, 400]
	const ZOOM_25_OPTION = { label: '25', value: '25' }
	const ZOOM_50_OPTION = { label: '50', value: '50' }
	const ZOOM_100_OPTION = { label: '100', value: '100' }
	const ZOOM_200_OPTION = { label: '200', value: '200' }
	const ZOOM_400_OPTION = { label: '400', value: '400' }
	const ZOOM_OPTIONS = [ZOOM_25_OPTION, ZOOM_50_OPTION, ZOOM_100_OPTION, ZOOM_200_OPTION, ZOOM_400_OPTION]
	const outputWidth = $derived(getOutputSize().width)
	// 100% is one picture pixel to one screen pixel.
	const zoomPercent = $derived(fitWidth > 0 ? (stageView.zoom * fitWidth * 100) / outputWidth : 100)
	const matchingPercent = $derived(ZOOM_PERCENTS.find((percent) => Math.abs(percent - zoomPercent) < 1))
	const zoomValue = $derived(isViewReset ? 'fit' : matchingPercent === undefined ? 'custom' : String(matchingPercent))
	const isFocused = $derived(uiState.isStageFocused)

	const frameStyle = $derived(
		`--stage-zoom: ${stageView.zoom}; transform: translate(${stageView.panX}px, ${stageView.panY}px) scale(${stageView.zoom});`
	)

	const checkIsControl = (target: EventTarget | null): boolean => {
		const isElement = target instanceof Element
		if (!isElement) return false
		return target.closest('[data-stage-control], button') !== null
	}

	const handlePointerDown = (event: PointerEvent) => {
		const target = event.target as HTMLHtmlElement
		const eventTargetId = target?.id
		const isZoomer = eventTargetId === 'stage-zoomer'
		if (isZoomer) return
		const isPanButton = event.button === 0 || event.button === 1
		if (!isPanButton || checkIsControl(event.target) || isFocused) return
		viewport.setPointerCapture(event.pointerId)
		drag = {
			startX: event.clientX,
			startY: event.clientY,
			startPanX: stageView.panX,
			startPanY: stageView.panY,
			hasMoved: false
		}
	}

	const handlePointerMove = (event: PointerEvent) => {
		const activeDrag = drag
		if (activeDrag === null) return
		const deltaX = event.clientX - activeDrag.startX
		const deltaY = event.clientY - activeDrag.startY
		const travel = Math.abs(deltaX) + Math.abs(deltaY)
		const hasStarted = activeDrag.hasMoved || travel > DRAG_THRESHOLD_PX
		if (!hasStarted) return
		activeDrag.hasMoved = true
		isPanning = true
		stageView.panX = activeDrag.startPanX + deltaX
		stageView.panY = activeDrag.startPanY + deltaY
	}

	const handlePointerUp = () => {
		drag = null
		isPanning = false
	}

	const handleDoubleClick = (event: MouseEvent) => {
		if (checkIsControl(event.target)) return
		resetStageView()
	}

	const readWheelPixels = (event: WheelEvent, delta: number): number => {
		const isLineMode = event.deltaMode === WheelEvent.DOM_DELTA_LINE
		return isLineMode ? delta * WHEEL_LINE_PX : delta
	}

	// Wheel and pinch both zoom, anchored on the cursor.
	const handleWheel = (event: WheelEvent) => {
		event.preventDefault()
		if (isFocused) return
		const bounds = viewport.getBoundingClientRect()
		const anchorX = event.clientX - (bounds.left + bounds.width / 2)
		const anchorY = event.clientY - (bounds.top + bounds.height / 2)
		const isPinch = event.ctrlKey || event.metaKey
		const rate = isPinch ? PINCH_ZOOM_RATE : WHEEL_ZOOM_RATE
		const deltaY = readWheelPixels(event, event.deltaY)
		zoomStageAt(Math.exp(-deltaY * rate), anchorX, anchorY)
	}

	$effect(() => {
		const observer = new ResizeObserver(() => (fitWidth = frameElement.offsetWidth))
		observer.observe(frameElement)
		return () => observer.disconnect()
	})

	// Fit shows the whole frame. A percent shows the picture at that
	// share of its real size, from the view's center.
	const handleZoomChange = (event: Event) => {
		const select = event.currentTarget as HTMLSelectElement
		const choice = select.value
		event.stopPropagation()
		event.preventDefault()

		select.blur()
		if (choice === 'fit') return resetStageView()
		const percent = Number(choice)
		const isNumber = Number.isFinite(percent)
		if (!isNumber || fitWidth <= 0) return
		setStageZoom((percent / 100) * (outputWidth / fitWidth))
	}

	$effect(() => {
		viewport.addEventListener('wheel', handleWheel, { passive: false })
		return () => viewport.removeEventListener('wheel', handleWheel)
	})

	onMount(() => attachCanvas(canvas))

	$effect(() => {
		const zoomer = document.getElementById('stage-zoomer') as (HTMLElement & { options?: typeof ZOOM_OPTIONS }) | null
		if (zoomer) zoomer.options = ZOOM_OPTIONS
	})
</script>

<div
	class="stage-viewport"
	class:isPanning
	bind:this={viewport}
	role="presentation"
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerUp}
	ondblclick={handleDoubleClick}
>
	<div
		class="stage-frame"
		class:isRecording={app.isRecording}
		class:isVertical
		class:isSquare
		class:isPortrait
		bind:this={frameElement}
		style={frameStyle}
	>
		<div class="stage-clip">
			<canvas class="stage-canvas" bind:this={canvas} width="1920" height="1080" aria-label="Visualizer preview"></canvas>

			{#if !app.isLayersReady}
				<div class="stage-cover">
					<z-progress isIndeterminate size="sm"></z-progress>
				</div>
			{/if}

			{#if app.isAnalyzing}
				<div class="stage-cover isCentered">
					<div class="stage-analyzing">
						<span class="stage-analyzing-title">Listening to your song</span>
						<z-progress value={analysisPercent} size="sm"></z-progress>
						<span class="stage-analyzing-hint">Finding kicks, snares and tempo · {analysisPercent}%</span>
					</div>
				</div>
			{/if}

			{#if app.isRecording}
				<div class="stage-recording">
					<z-progress value={recordPercent} size="sm" tone="danger"></z-progress>
				</div>
			{/if}
		</div>
	</div>

	{#if !isFocused && !uiState.isUiHidden}
		<z-row class="zoomer-box" style="max-width: 200px; background: var(--color-neutral-1);">
			<z-select
				id="stage-zoomer"
				style="min-width: 100px"
				aria-label="Stage zoom"
				value={zoomValue}
				onchange={handleZoomChange}
			>
				<!-- TODO: Actually set this up as a number input with zoom.... -->
			</z-select>
		</z-row>
	{/if}
</div>

<style>
	.zoomer-box {
		max-width: 200px;
		position: fixed;
		right: 12px;
		top: 50px;
	}
</style>
