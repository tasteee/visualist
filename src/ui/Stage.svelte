<script lang="ts">
	import { onMount } from 'svelte'
	import { automation, recordHistory } from '../automation.svelte'
	import { applyLayerAutomation } from '../engine/automation'
	import type { LayerT } from '../engine/types'
	import { layerStore } from '../layers.svelte'
	import { checkIsLayerSelected } from '../layers.svelte'
	import { clearSelection, pickLayer, readModifiers } from '../selection.svelte'
	import type { PickModifiersT } from '../selection.svelte'
	import { checkIsStageReset, getSelectedLayers, moveLayerBy, resetStageView, setStageZoom, stageView, zoomStageAt } from '../stage.svelte'
	import { findLayerAtPoint, readFrame } from '../stageGeometry'
	import type { FramePointT } from '../stageGeometry'
	import { uiState } from '../uiState.svelte'
	import { app, attachCanvas, getOutputSize } from '../store.svelte'
	import StageSelection from './StageSelection.svelte'
	import './Stage.css'

	// A press on the stage is one of two things. On a layer that
	// is already selected it moves the layer. Anywhere else it
	// pans the view, and a click that never moved selects the
	// layer under it, or clears the selection over empty space.
	type StageDragT = {
		mode: 'pan' | 'move'
		startX: number
		startY: number
		startPanX: number
		startPanY: number
		startPositions: Map<string, { x: number; y: number }>
		pendingLayerId: string | null
		modifiers: PickModifiersT
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
	const frame = $derived(readFrame(app.settings.aspectRatio))
	const isViewReset = $derived(checkIsStageReset())
	const ZOOM_PERCENTS = [25, 50, 100, 200, 400]
	const outputWidth = $derived(getOutputSize().width)
	// 100% is one picture pixel to one screen pixel.
	const zoomPercent = $derived(fitWidth > 0 ? (stageView.zoom * fitWidth * 100) / outputWidth : 100)
	const matchingPercent = $derived(ZOOM_PERCENTS.find((percent) => Math.abs(percent - zoomPercent) < 1))
	const zoomValue = $derived(isViewReset ? 'fit' : matchingPercent === undefined ? 'custom' : String(matchingPercent))
	const customLabel = $derived(`${Math.round(zoomPercent)}%`)
	const canEditLayers = $derived(app.isLayersReady && !app.isRecording)
	const isFocused = $derived(uiState.isStageFocused)
	const shouldShowHandles = $derived(canEditLayers && !uiState.isUiHidden && !isFocused)

	const frameStyle = $derived(`--stage-zoom: ${stageView.zoom}; transform: translate(${stageView.panX}px, ${stageView.panY}px) scale(${stageView.zoom});`)

	const getFrameRect = (): DOMRect => frameElement.getBoundingClientRect()

	const readFramePoint = (event: PointerEvent): FramePointT => {
		const rect = getFrameRect()
		const x = ((event.clientX - rect.left) / rect.width) * frame.width
		const y = ((event.clientY - rect.top) / rect.height) * frame.height
		return { x, y }
	}

	const readLiveLayers = (): LayerT[] => {
		return applyLayerAutomation(layerStore.layers as LayerT[], app.settings, automation.lanes, app.currentTime)
	}

	const findLayerUnderPointer = (event: PointerEvent): LayerT | null => {
		const palette = { accent1: app.settings.accent1, accent2: app.settings.accent2, background: app.settings.background, foreground: app.settings.foreground }
		const point = readFramePoint(event)
		return findLayerAtPoint(readLiveLayers(), palette, frame, app.currentTime, point)
	}

	const capturePositions = (): Map<string, { x: number; y: number }> => {
		const positions = new Map<string, { x: number; y: number }>()
		for (const layer of getSelectedLayers()) positions.set(layer.id, { x: layer.transform.x, y: layer.transform.y })
		return positions
	}

	const checkIsControl = (target: EventTarget | null): boolean => {
		const isElement = target instanceof Element
		if (!isElement) return false
		return target.closest('[data-stage-control], button') !== null
	}

	const handlePointerDown = (event: PointerEvent) => {
		const isPanButton = event.button === 0 || event.button === 1
		if (!isPanButton || checkIsControl(event.target) || isFocused) return
		const modifiers = readModifiers(event)
		const isPicking = modifiers.isRange || modifiers.isToggle
		const layer = canEditLayers ? findLayerUnderPointer(event) : null
		const isOnSelected = layer !== null && checkIsLayerSelected(layer.id)
		const shouldMove = isOnSelected && !isPicking
		viewport.setPointerCapture(event.pointerId)
		drag = {
			mode: shouldMove ? 'move' : 'pan',
			startX: event.clientX,
			startY: event.clientY,
			startPanX: stageView.panX,
			startPanY: stageView.panY,
			startPositions: shouldMove ? capturePositions() : new Map(),
			pendingLayerId: layer === null ? null : layer.id,
			modifiers,
			hasMoved: false
		}
	}

	const moveSelectedLayers = (event: PointerEvent, activeDrag: StageDragT) => {
		const rect = getFrameRect()
		const deltaXPercent = ((event.clientX - activeDrag.startX) / rect.width) * 100
		const deltaYPercent = ((event.clientY - activeDrag.startY) / rect.height) * 100
		for (const layer of getSelectedLayers()) {
			const start = activeDrag.startPositions.get(layer.id)
			if (start === undefined) continue
			layer.transform.x = start.x
			layer.transform.y = start.y
			moveLayerBy(layer, deltaXPercent, deltaYPercent)
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
		const isFirstMove = !activeDrag.hasMoved
		activeDrag.hasMoved = true
		if (activeDrag.mode === 'pan') {
			isPanning = true
			stageView.panX = activeDrag.startPanX + deltaX
			stageView.panY = activeDrag.startPanY + deltaY
			return
		}
		// One undo step per move, recorded when it really starts.
		if (isFirstMove) recordHistory()
		moveSelectedLayers(event, activeDrag)
	}

	const finishClick = (activeDrag: StageDragT) => {
		const layerId = activeDrag.pendingLayerId
		const isOverLayer = layerId !== null
		if (!isOverLayer) return clearSelection()
		const orderedIds = [...layerStore.layers].reverse().map((layer) => layer.id)
		pickLayer(layerId, orderedIds, activeDrag.modifiers)
	}

	const handlePointerUp = () => {
		const activeDrag = drag
		drag = null
		isPanning = false
		if (activeDrag === null || activeDrag.hasMoved) return
		const isMove = activeDrag.mode === 'move'
		if (isMove) return
		finishClick(activeDrag)
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
	<div class="stage-frame" class:isRecording={app.isRecording} class:isVertical class:isSquare class:isPortrait bind:this={frameElement} style={frameStyle}>
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

		{#if shouldShowHandles}
			<StageSelection {frame} {getFrameRect} />
		{/if}
	</div>

	{#if !isFocused && !uiState.isUiHidden}
		<select class="stage-zoom" aria-label="Stage zoom" value={zoomValue} onchange={handleZoomChange}>
			<option value="fit">Fit</option>
			{#each ZOOM_PERCENTS as percent (percent)}
				<option value={percent}>{percent}%</option>
			{/each}
			{#if zoomValue === 'custom'}
				<option value="custom" disabled>{customLabel}</option>
			{/if}
		</select>
	{/if}
</div>
