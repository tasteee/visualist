import { resolveLayerDepth } from './layerRender'
import type { FrameInputT, LayerT, SettingsT } from './types'

// Small enough to count as "on the frame". Modulated depth that
// settles back near zero snaps onto the base sheet.
const FLAT_DEPTH = 0.05

// One sheet of the 3D stage. Layers that share a depth share a
// sheet and blend with each other exactly like the flat render.
export type DepthSliceT = {
	depth: number
	layers: LayerT[]
	isBase: boolean
}

export const checkIsCameraMoved = (settings: SettingsT): boolean => {
	const isOrbited = Math.abs(settings.cameraOrbit) > 0.01
	const isTilted = Math.abs(settings.cameraTilt) > 0.01
	const isDollied = Math.abs(settings.cameraDistance - 1) > 0.001
	return isOrbited || isTilted || isDollied
}

const getLayerDepth = (layer: LayerT, input: FrameInputT): number => {
	if (!layer.isVisible) return 0
	const depth = resolveLayerDepth(layer, input.signals)
	if (depth < FLAT_DEPTH) return 0
	return Math.round(depth * 100) / 100
}

// The flat render is used whenever nothing would look different
// in 3D, so projects without depth render exactly as before.
export const checkNeedsDepth = (input: FrameInputT): boolean => {
	if (checkIsCameraMoved(input.settings)) return true
	return input.layers.some((layer) => getLayerDepth(layer, input) > 0)
}

// Back to front. The base slice (depth 0) always exists because
// it carries the background.
export const buildDepthSlices = (input: FrameInputT): DepthSliceT[] => {
	const byDepth = new Map<number, LayerT[]>([[0, []]])
	for (const layer of input.layers) {
		const depth = getLayerDepth(layer, input)
		const slice = byDepth.get(depth) ?? []
		slice.push(layer)
		byDepth.set(depth, slice)
	}
	const depths = [...byDepth.keys()].sort((first, second) => first - second)
	return depths.map((depth) => ({ depth, layers: byDepth.get(depth) ?? [], isBase: depth === 0 }))
}
