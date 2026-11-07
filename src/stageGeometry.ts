import { getFrameLayout } from './engine/formats'
import type { FrameLayoutT } from './engine/formats'
import { measureLayerSize } from './engine/layerRender'
import { getTimeRangeLevel } from './engine/layers'
import type { LayerT, PaletteT } from './engine/types'

// Where a layer sits in the frame, in frame units, as the stage
// draws its selection box. The box follows the layer's live
// transform, so an automated layer's box moves with it.
export type LayerBoxT = {
	layerId: string
	centerX: number
	centerY: number
	width: number
	height: number
	rotation: number
	scale: number
}

export type FramePointT = {
	x: number
	y: number
}

export const readFrame = (aspectRatio: Parameters<typeof getFrameLayout>[0]): FrameLayoutT => getFrameLayout(aspectRatio)

export const buildLayerBox = (layer: LayerT, palette: PaletteT, frame: FrameLayoutT, time = 0): LayerBoxT | null => {
	const size = measureLayerSize(layer, palette, frame, time)
	if (size === null) return null
	const centerX = frame.width / 2 + (layer.transform.x / 100) * frame.width
	const centerY = frame.height / 2 + (layer.transform.y / 100) * frame.height
	return {
		layerId: layer.id,
		centerX,
		centerY,
		width: size.width,
		height: size.height,
		rotation: layer.transform.rotation,
		scale: layer.transform.scale
	}
}

// Layers that are hidden, or outside their time range, can not
// be picked on the stage.
export const checkIsLayerPickable = (layer: LayerT, time: number): boolean => {
	if (!layer.isVisible) return false
	return getTimeRangeLevel(layer, time) > 0
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

// The point, as seen from the box's own unrotated frame.
export const toBoxSpace = (box: LayerBoxT, point: FramePointT): FramePointT => {
	const offsetX = point.x - box.centerX
	const offsetY = point.y - box.centerY
	const angle = -toRadians(box.rotation)
	const cos = Math.cos(angle)
	const sin = Math.sin(angle)
	return { x: offsetX * cos - offsetY * sin, y: offsetX * sin + offsetY * cos }
}

export const checkIsPointInBox = (box: LayerBoxT, point: FramePointT): boolean => {
	const local = toBoxSpace(box, point)
	const halfWidth = (box.width * box.scale) / 2
	const halfHeight = (box.height * box.scale) / 2
	const isInX = Math.abs(local.x) <= halfWidth
	const isInY = Math.abs(local.y) <= halfHeight
	return isInX && isInY
}

// The front-most pickable layer under the point. Layers are
// stored back to front.
export const findLayerAtPoint = (layers: LayerT[], palette: PaletteT, frame: FrameLayoutT, time: number, point: FramePointT): LayerT | null => {
	const frontToBack = [...layers].reverse()
	for (const layer of frontToBack) {
		const isPickable = checkIsLayerPickable(layer, time)
		if (!isPickable) continue
		const box = buildLayerBox(layer, palette, frame, time)
		if (box === null) continue
		const isImpulse = checkIsPointInBox(box, point)
		if (isImpulse) return layer
	}
	return null
}

export const getBoxAngle = (box: LayerBoxT, point: FramePointT): number => {
	const radians = Math.atan2(point.y - box.centerY, point.x - box.centerX)
	return (radians * 180) / Math.PI
}

export const getBoxDistance = (box: LayerBoxT, point: FramePointT): number => {
	return Math.hypot(point.x - box.centerX, point.y - box.centerY)
}
