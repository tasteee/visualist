<script lang="ts">
	import ArrowFatLineDownIcon from 'phosphor-svelte/lib/ArrowFatLineDownIcon'
	import ArrowFatLineUpIcon from 'phosphor-svelte/lib/ArrowFatLineUpIcon'
	import { automation, recordHistory, recordHistoryCoalesced } from '../automation.svelte'
	import { applyLayerAutomation } from '../engine/automation'
	import type { FrameLayoutT } from '../engine/formats'
	import { clamp } from '../engine/settings'
	import type { LayerT } from '../engine/types'
	import { checkCanMove, layerStore, moveLayer } from '../layers.svelte'
	import { getSelectedLayers } from '../stage.svelte'
	import { checkIsParamAutomated } from '../stage.svelte'
	import { buildLayerBox, getBoxAngle, getBoxDistance } from '../stageGeometry'
	import type { FramePointT, LayerBoxT } from '../stageGeometry'
	import { app } from '../store.svelte'
	import { buildEnginePalette } from '../palette.svelte'
	import { press } from './press'
	import './StageSelection.css'

	// The box around each selected layer. The primary layer also
	// gets resize and rotate handles, an opacity slider and the
	// stacking buttons. A channel that is automated shows its
	// handle but ignores it: the lane is the only editor for it.
	type StageSelectionPropsT = {
		frame: FrameLayoutT
		getFrameRect: () => DOMRect
	}

	type HandleDragT = {
		kind: 'resize' | 'rotate'
		layerId: string
		box: LayerBoxT
		startDistance: number
		startAngle: number
		startScale: number
		startRotation: number
		hasMoved: boolean
	}

	const props: StageSelectionPropsT = $props()

	const MIN_SCALE = 0.05
	const MAX_SCALE = 3
	const ROTATION_SNAP_DEGREES = 15
	const DRAG_THRESHOLD_PX = 3

	let handleDrag: HandleDragT | null = null
	let dragStartClient: { x: number; y: number } | null = null

	const palette = $derived(buildEnginePalette(app.settings.background))

	// Boxes follow what is on screen at the playhead, so an
	// animated layer is boxed where it is, not where it started.
	const liveLayers = $derived(applyLayerAutomation(layerStore.layers as LayerT[], app.settings, automation.lanes, app.currentTime))

	const selectedIds = $derived(layerStore.selectedLayerIds)
	const primaryId = $derived(layerStore.selectedLayerId)

	const boxes = $derived.by(() => {
		const selected = liveLayers.filter((layer) => selectedIds.includes(layer.id))
		const built = selected.map((layer) => buildLayerBox(layer, palette, props.frame))
		return built.filter((box): box is LayerBoxT => box !== null)
	})

	const primaryBox = $derived(boxes.find((box) => box.layerId === primaryId))
	const primaryLayer = $derived(getSelectedLayers().find((layer) => layer.id === primaryId))

	const isScaleLocked = $derived(primaryId !== null && checkIsParamAutomated(primaryId, 'scale'))
	const isRotationLocked = $derived(primaryId !== null && checkIsParamAutomated(primaryId, 'rotation'))
	const isOpacityLocked = $derived(primaryId !== null && checkIsParamAutomated(primaryId, 'opacity'))
	const liveOpacity = $derived(liveLayers.find((layer) => layer.id === primaryId)?.transform.opacity ?? 1)
	const canSendBackward = $derived(primaryId !== null && checkCanMove(primaryId, 'backward'))
	const canBringForward = $derived(primaryId !== null && checkCanMove(primaryId, 'forward'))

	const toPercent = (value: number, total: number): string => `${(value / total) * 100}%`

	const getBoxStyle = (box: LayerBoxT): string => {
		const left = toPercent(box.centerX, props.frame.width)
		const top = toPercent(box.centerY, props.frame.height)
		const width = toPercent(box.width * box.scale, props.frame.width)
		const height = toPercent(box.height * box.scale, props.frame.height)
		return `left: ${left}; top: ${top}; width: ${width}; height: ${height}; --box-rotation: ${box.rotation}deg;`
	}

	// The toolbar hangs under the box's lowest edge, however the
	// box is turned.
	const getToolbarStyle = (box: LayerBoxT): string => {
		const radians = (box.rotation * Math.PI) / 180
		const scaledWidth = box.width * box.scale
		const scaledHeight = box.height * box.scale
		const halfHeight = (Math.abs(Math.sin(radians)) * scaledWidth + Math.abs(Math.cos(radians)) * scaledHeight) / 2
		const left = toPercent(box.centerX, props.frame.width)
		const top = toPercent(box.centerY + halfHeight, props.frame.height)
		return `left: ${left}; top: ${top};`
	}

	const readFramePoint = (event: PointerEvent): FramePointT => {
		const rect = props.getFrameRect()
		const x = ((event.clientX - rect.left) / rect.width) * props.frame.width
		const y = ((event.clientY - rect.top) / rect.height) * props.frame.height
		return { x, y }
	}

	const startHandleDrag = (event: PointerEvent, kind: 'resize' | 'rotate') => {
		event.stopPropagation()
		event.preventDefault()
		const isPrimaryButton = event.button === 0
		const box = primaryBox
		const layer = primaryLayer
		if (!isPrimaryButton || box === undefined || layer === undefined) return
		const target = event.currentTarget as HTMLElement
		target.setPointerCapture(event.pointerId)
		const point = readFramePoint(event)
		handleDrag = {
			kind,
			layerId: layer.id,
			box,
			startDistance: Math.max(1, getBoxDistance(box, point)),
			startAngle: getBoxAngle(box, point),
			startScale: layer.transform.scale,
			startRotation: layer.transform.rotation,
			hasMoved: false
		}
		dragStartClient = { x: event.clientX, y: event.clientY }
	}

	const handleResizeDown = (event: PointerEvent) => {
		if (isScaleLocked) return event.stopPropagation()
		startHandleDrag(event, 'resize')
	}

	const handleRotateDown = (event: PointerEvent) => {
		if (isRotationLocked) return event.stopPropagation()
		startHandleDrag(event, 'rotate')
	}

	const normalizeDegrees = (degrees: number): number => {
		const wrapped = ((((degrees + 180) % 360) + 360) % 360) - 180
		return wrapped
	}

	const applyResize = (layer: LayerT, drag: HandleDragT, point: FramePointT) => {
		const distance = getBoxDistance(drag.box, point)
		const nextScale = (drag.startScale * distance) / drag.startDistance
		layer.transform.scale = clamp(nextScale, MIN_SCALE, MAX_SCALE)
	}

	const applyRotate = (layer: LayerT, drag: HandleDragT, point: FramePointT, event: PointerEvent) => {
		const angle = getBoxAngle(drag.box, point)
		const rawRotation = drag.startRotation + (angle - drag.startAngle)
		const snapped = event.shiftKey ? Math.round(rawRotation / ROTATION_SNAP_DEGREES) * ROTATION_SNAP_DEGREES : rawRotation
		layer.transform.rotation = normalizeDegrees(snapped)
	}

	const handleHandleMove = (event: PointerEvent) => {
		const drag = handleDrag
		const start = dragStartClient
		if (drag === null || start === null) return
		const travel = Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y)
		const hasStarted = drag.hasMoved || travel > DRAG_THRESHOLD_PX
		if (!hasStarted) return
		// One undo step per drag, recorded when it really moves.
		if (!drag.hasMoved) recordHistory()
		drag.hasMoved = true
		const layer = layerStore.layers.find((candidate) => candidate.id === drag.layerId)
		if (layer === undefined) return
		const point = readFramePoint(event)
		if (drag.kind === 'resize') return applyResize(layer as LayerT, drag, point)
		applyRotate(layer as LayerT, drag, point, event)
	}

	const handleHandleUp = () => {
		handleDrag = null
		dragStartClient = null
	}

	const handleOpacityInput = (event: Event) => {
		if (primaryLayer === undefined || isOpacityLocked) return
		const detail = (event as CustomEvent<{ value: number }>).detail
		const isChange = detail.value !== primaryLayer.transform.opacity
		if (isChange) recordHistoryCoalesced(`stage-opacity:${primaryLayer.id}`)
		primaryLayer.transform.opacity = clamp(detail.value, 0, 1)
	}

	const stopControlPress = (event: PointerEvent) => event.stopPropagation()

	const sendBackward = () => {
		if (primaryId !== null) moveLayer(primaryId, 'backward')
	}

	const bringForward = () => {
		if (primaryId !== null) moveLayer(primaryId, 'forward')
	}
</script>

<div class="stage-selection">
	{#each boxes as box (box.layerId)}
		{@const isPrimary = box.layerId === primaryId}
		<div class="stage-box" class:isPrimary style={getBoxStyle(box)}>
			{#if isPrimary}
				<span class="stage-handle isRotate" class:isInert={isRotationLocked} data-stage-control role="presentation" onpointerdown={handleRotateDown} onpointermove={handleHandleMove} onpointerup={handleHandleUp} onpointercancel={handleHandleUp}></span>
				<span class="stage-stem" aria-hidden="true"></span>
				{#each ['nw', 'ne', 'se', 'sw'] as corner (corner)}
					<span
						class="stage-handle isCorner is-{corner}"
						class:isInert={isScaleLocked}
						data-stage-control
						role="presentation"
						onpointerdown={handleResizeDown}
						onpointermove={handleHandleMove}
						onpointerup={handleHandleUp}
						onpointercancel={handleHandleUp}
					></span>
				{/each}
			{/if}
		</div>
	{/each}

	{#if primaryBox !== undefined}
		<div class="stage-toolbar" style={getToolbarStyle(primaryBox)} data-stage-control role="toolbar" aria-label="Layer controls" tabindex="-1" onpointerdown={stopControlPress}>
			<z-slider class="stage-opacity" aria-label="Opacity" min={0} max={1} step={0.01} value={liveOpacity} isDisabled={isOpacityLocked} oninput={handleOpacityInput} onchange={handleOpacityInput}></z-slider>
			<z-tooltip content="Send backward" placement="bottom">
				<button class="stage-tool" type="button" aria-label="Send backward" disabled={!canSendBackward} {...press(sendBackward)}>
					<ArrowFatLineDownIcon weight="bold" />
				</button>
			</z-tooltip>
			<z-tooltip content="Bring forward" placement="bottom">
				<button class="stage-tool" type="button" aria-label="Bring forward" disabled={!canBringForward} {...press(bringForward)}>
					<ArrowFatLineUpIcon weight="bold" />
				</button>
			</z-tooltip>
		</div>
	{/if}
</div>
