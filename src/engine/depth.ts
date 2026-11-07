import { resolveLayerAngles, resolveLayerDepth } from './layerRender'
import type { FrameInputT, LayerT, SettingsT } from './types'

// Small enough to count as "on the frame". Modulated depth that
// settles back near zero snaps onto the base sheet.
const FLAT_DEPTH = 0.05
const FLAT_ANGLE = 0.05

// A layer that leaves the frame: drawn by the GPU, in front of
// the base sheet.
export type FloatingLayerT = {
	layer: LayerT
	depth: number
	// Position in the stack, bottom first. Breaks depth ties.
	order: number
}

// Layers on the frame are drawn by the 2D renderer onto one base
// sheet together with the background, every blend mode exact.
export type StageLayersT = {
	flat: LayerT[]
	floating: FloatingLayerT[]
}

export const checkIsCameraMoved = (settings: SettingsT): boolean => {
	const isOrbited = Math.abs(settings.cameraOrbit) > 0.01
	const isTilted = Math.abs(settings.cameraTilt) > 0.01
	const isDollied = Math.abs(settings.cameraDistance - 1) > 0.001
	return isOrbited || isTilted || isDollied
}

const getLayerDepth = (layer: LayerT, input: FrameInputT): number => {
	const depth = resolveLayerDepth(layer, input.signals)
	if (depth < FLAT_DEPTH) return 0
	return depth
}

const checkIsAngled = (layer: LayerT, input: FrameInputT): boolean => {
	const angles = resolveLayerAngles(layer, input.signals)
	return Math.abs(angles.tilt) > FLAT_ANGLE || Math.abs(angles.turn) > FLAT_ANGLE
}

const checkIsFloating = (layer: LayerT, input: FrameInputT): boolean => {
	if (!layer.isVisible) return false
	return getLayerDepth(layer, input) > 0 || checkIsAngled(layer, input)
}

// The flat render is used whenever nothing would look different
// in 3D, so projects without depth render exactly as before.
export const checkNeedsDepth = (input: FrameInputT): boolean => {
	if (checkIsCameraMoved(input.settings)) return true
	return input.layers.some((layer) => checkIsFloating(layer, input))
}

export const splitStageLayers = (input: FrameInputT): StageLayersT => {
	const flat: LayerT[] = []
	const floating: FloatingLayerT[] = []
	input.layers.forEach((layer, order) => {
		const isFloating = checkIsFloating(layer, input)
		if (!isFloating) flat.push(layer)
		if (isFloating) floating.push({ layer, depth: getLayerDepth(layer, input), order })
	})
	// Back to front: farther first, then stack order.
	floating.sort((first, second) => first.depth - second.depth || first.order - second.order)
	return { flat, floating }
}
