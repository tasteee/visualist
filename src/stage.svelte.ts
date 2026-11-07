import { automation, recordHistoryCoalesced } from './automation.svelte'
import { checkIsTargetAutomated } from './engine/automation'
import { clamp } from './engine/settings'
import type { LayerParamKeyT, LayerT } from './engine/types'
import { findLayer, layerStore } from './layers.svelte'

// The stage is a viewport onto the composition. Its zoom and
// pan belong to the view, not to the layers: changing them
// never moves a layer.
type StageViewT = {
	zoom: number
	// Pan in screen pixels, from the viewport's center.
	panX: number
	panY: number
}

export const MIN_STAGE_ZOOM = 0.25
export const MAX_STAGE_ZOOM = 12

const DEFAULT_PAN_Y = 0

export const stageView = $state<StageViewT>({ zoom: 1, panX: 0, panY: DEFAULT_PAN_Y })

export const resetStageView = (): void => {
	stageView.zoom = 1
	stageView.panX = 0
	stageView.panY = DEFAULT_PAN_Y
}

export const checkIsStageReset = (): boolean => {
	const isUnzoomed = stageView.zoom === 1
	const isCentered = stageView.panX === 0 && stageView.panY === DEFAULT_PAN_Y
	return isUnzoomed && isCentered
}

// The anchor is a point in pixels from the viewport's center.
// It stays under the cursor while the zoom changes.
export const zoomStageAt = (factor: number, anchorX: number, anchorY: number): void => {
	const nextZoom = clamp(stageView.zoom * factor, MIN_STAGE_ZOOM, MAX_STAGE_ZOOM)
	const appliedFactor = nextZoom / stageView.zoom
	stageView.panX = anchorX - (anchorX - stageView.panX) * appliedFactor
	stageView.panY = anchorY - (anchorY - stageView.panY) * appliedFactor
	stageView.zoom = nextZoom
}

// Sets the zoom from the view's center, as the Fit and percent
// menu does.
export const setStageZoom = (zoom: number): void => {
	const clamped = clamp(zoom, MIN_STAGE_ZOOM, MAX_STAGE_ZOOM)
	zoomStageAt(clamped / stageView.zoom, 0, 0)
}

export const panStageBy = (deltaX: number, deltaY: number): void => {
	stageView.panX += deltaX
	stageView.panY += deltaY
}

// ---- Layers on the stage ------------------------------------

export const checkIsParamAutomated = (layerId: string, param: LayerParamKeyT): boolean => {
	return checkIsTargetAutomated(automation.lanes, { kind: 'layer', layerId, param })
}

export type LayerAxesT = {
	canMoveX: boolean
	canMoveY: boolean
}

// An automated channel can only be edited in its lane, so the
// stage can not write it.
export const getLayerAxes = (layerId: string): LayerAxesT => ({
	canMoveX: !checkIsParamAutomated(layerId, 'x'),
	canMoveY: !checkIsParamAutomated(layerId, 'y')
})

const MAX_OFFSET = 60

export const moveLayerBy = (layer: LayerT, deltaXPercent: number, deltaYPercent: number): void => {
	const axes = getLayerAxes(layer.id)
	if (axes.canMoveX) layer.transform.x = clamp(layer.transform.x + deltaXPercent, -MAX_OFFSET, MAX_OFFSET)
	if (axes.canMoveY) layer.transform.y = clamp(layer.transform.y + deltaYPercent, -MAX_OFFSET, MAX_OFFSET)
}

export const getSelectedLayers = (): LayerT[] => {
	const selected = layerStore.selectedLayerIds.map((layerId) => findLayer(layerId))
	return selected.filter((layer): layer is LayerT => layer !== undefined)
}

// Arrow keys: true when a selected layer took the key, even if
// its channel is automated and nothing moved.
export const nudgeSelectedLayers = (deltaXPercent: number, deltaYPercent: number): boolean => {
	const layers = getSelectedLayers()
	const hasLayers = layers.length > 0
	if (!hasLayers) return false
	const canMoveAny = layers.some((layer) => {
		const axes = getLayerAxes(layer.id)
		const movesX = deltaXPercent !== 0 && axes.canMoveX
		const movesY = deltaYPercent !== 0 && axes.canMoveY
		return movesX || movesY
	})
	if (!canMoveAny) return true
	recordHistoryCoalesced('nudge-layers')
	for (const layer of layers) moveLayerBy(layer, deltaXPercent, deltaYPercent)
	return true
}
