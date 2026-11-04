import { FX_SPECS, LAYER_PARAMS, findFxSpec, findLayerParam } from './layers'
import { clamp } from './settings'
import type {
	AutomatableKeyT,
	AutomationControlT,
	AutomationLaneT,
	AutomationPointT,
	LaneControlT,
	LaneTargetT,
	LayerFxT,
	LayerT,
	SettingsT
} from './types'

export const PATH_WIDTH = 1000
export const PATH_HEIGHT = 100
export const MIN_POINT_GAP = 0.02

// A full bend squeezes the segment by this factor.
const BEND_BASE = 8
const BENT_SAMPLES = 32

export const AUTOMATION_CONTROLS: AutomationControlT[] = [
	{ key: 'logoBorder', label: 'Logo border', min: 0, max: 1, step: 0.05 },
	{ key: 'reactivity', label: 'Reactivity', min: 0, max: 2, step: 0.05 },
	{ key: 'echoAmount', label: 'Echoes amount', min: 0, max: 2, step: 0.05 },
	{ key: 'echoSize', label: 'Echoes size', min: 0, max: 2, step: 0.05 },
	{ key: 'echoSpeed', label: 'Echoes speed', min: 0.4, max: 3, step: 0.05 },
	{ key: 'glitchAmount', label: 'Glitch amount', min: 0, max: 2, step: 0.05 },
	{ key: 'textureAmount', label: 'Texture amount', min: 0, max: 2, step: 0.05 },
	{ key: 'solidAmount', label: 'Solids amount', min: 0, max: 2, step: 0.05 },
	{ key: 'bloomAmount', label: 'Bloom', min: 0, max: 2, step: 0.05 },
	{ key: 'aberrationAmount', label: 'Chromatic aberration', min: 0, max: 2, step: 0.05 },
	{ key: 'warpAmount', label: 'Warp', min: 0, max: 2, step: 0.05 },
	{ key: 'scanlineAmount', label: 'Scanlines', min: 0, max: 1, step: 0.05 },
	{ key: 'noiseAmount', label: 'Film noise', min: 0, max: 1, step: 0.05 },
	{ key: 'vignetteAmount', label: 'Vignette', min: 0, max: 1, step: 0.05 }
]

export const findControl = (key: AutomatableKeyT | null): AutomationControlT | null => {
	if (key === null) return null
	const control = AUTOMATION_CONTROLS.find((candidate) => candidate.key === key)
	return control ?? null
}

export const toNormalized = (control: LaneControlT, value: number): number => {
	const range = control.max - control.min
	return clamp((value - control.min) / range, 0, 1)
}

export const toControlValue = (control: LaneControlT, normalized: number): number => {
	const range = control.max - control.min
	return control.min + clamp(normalized, 0, 1) * range
}

export const formatControlValue = (value: number): string => value.toFixed(2)

// Positive bend bulges the segment upward, negative sags it.
const shapeProgress = (progress: number, bend: number, isRising: boolean): number => {
	const direction = isRising ? -1 : 1
	const exponent = Math.pow(BEND_BASE, bend * direction)
	return Math.pow(progress, exponent)
}

export const findSegmentStart = (points: AutomationPointT[], time: number): number => {
	const lastIndex = points.length - 1
	for (let index = 0; index < lastIndex; index++) {
		const isAfterStart = time >= points[index].time
		const isBeforeEnd = time <= points[index + 1].time
		if (isAfterStart && isBeforeEnd) return index
	}
	return -1
}

const interpolateSegment = (start: AutomationPointT, end: AutomationPointT, time: number): number => {
	const span = end.time - start.time
	const progress = span <= 0 ? 1 : (time - start.time) / span
	const isRising = end.value >= start.value
	const shaped = shapeProgress(clamp(progress, 0, 1), start.bend, isRising)
	return start.value + (end.value - start.value) * shaped
}

// Returns a normalized 0-1 value. Without points the lane
// just follows the control's own current setting.
export const evaluatePoints = (points: AutomationPointT[], time: number, fallback: number): number => {
	const hasPoints = points.length > 0
	if (!hasPoints) return fallback
	const first = points[0]
	const last = points[points.length - 1]
	if (time <= first.time) return first.value
	if (time >= last.time) return last.value
	const startIndex = findSegmentStart(points, time)
	return interpolateSegment(points[startIndex], points[startIndex + 1], time)
}

// ---- Targets ------------------------------------------------

// Lanes group in the timeline: global settings together, and
// each layer's lanes under that layer.
export const GLOBAL_GROUP_ID = 'global'

export const getTargetGroupId = (target: LaneTargetT): string => {
	const isSetting = target.kind === 'setting'
	if (isSetting) return GLOBAL_GROUP_ID
	return target.layerId
}

export const checkIsSameTarget = (first: LaneTargetT, second: LaneTargetT): boolean => {
	const isSettingPair = first.kind === 'setting' && second.kind === 'setting'
	if (isSettingPair) return first.key === second.key
	const isLayerPair = first.kind === 'layer' && second.kind === 'layer'
	if (isLayerPair) return first.layerId === second.layerId && first.param === second.param
	const isFxPair = first.kind === 'fx' && second.kind === 'fx'
	if (isFxPair) return first.layerId === second.layerId && first.fxId === second.fxId
	return false
}

// A stable string per target, for select values and keys.
export const getTargetId = (target: LaneTargetT): string => {
	if (target.kind === 'setting') return `setting:${target.key}`
	if (target.kind === 'layer') return `layer:${target.layerId}:${target.param}`
	return `fx:${target.layerId}:${target.fxId}`
}

const findLayer = (layers: LayerT[], layerId: string): LayerT | undefined => {
	return layers.find((layer) => layer.id === layerId)
}

const findLayerFx = (layers: LayerT[], layerId: string, fxId: string): LayerFxT | undefined => {
	const layer = findLayer(layers, layerId)
	if (layer === undefined) return undefined
	return layer.fx.find((fx) => fx.id === fxId)
}

// null when the target no longer exists, such as a lane whose
// layer or effect was removed.
export const getTargetControl = (target: LaneTargetT, layers: LayerT[]): LaneControlT | null => {
	if (target.kind === 'setting') return findControl(target.key)
	if (target.kind === 'layer') {
		const layer = findLayer(layers, target.layerId)
		if (layer === undefined) return null
		const spec = findLayerParam(target.param)
		return { label: spec.label, min: spec.min, max: spec.max, step: spec.step }
	}
	const fx = findLayerFx(layers, target.layerId, target.fxId)
	if (fx === undefined) return null
	const spec = findFxSpec(fx.kind)
	return { label: spec.label, min: spec.min, max: spec.max, step: spec.step }
}

// The value the control holds when no lane drives it.
export const getTargetBase = (target: LaneTargetT, settings: SettingsT, layers: LayerT[]): number | null => {
	if (target.kind === 'setting') return settings[target.key]
	if (target.kind === 'layer') {
		const layer = findLayer(layers, target.layerId)
		if (layer === undefined) return null
		return layer.transform[target.param]
	}
	const fx = findLayerFx(layers, target.layerId, target.fxId)
	if (fx === undefined) return null
	return fx.amount
}

export const checkIsTargetLive = (target: LaneTargetT, layers: LayerT[]): boolean => getTargetControl(target, layers) !== null

export const findLaneForTarget = (lanes: AutomationLaneT[], target: LaneTargetT): AutomationLaneT | undefined => {
	return lanes.find((lane) => checkIsSameTarget(lane.target, target))
}

export const checkIsTargetAutomated = (lanes: AutomationLaneT[], target: LaneTargetT): boolean => {
	const lane = findLaneForTarget(lanes, target)
	if (lane === undefined) return false
	return lane.points.length > 0
}

// The lane's value at this instant, in the control's own units.
export const getLiveLaneValue = (lane: AutomationLaneT, settings: SettingsT, layers: LayerT[], time: number): number | null => {
	const control = getTargetControl(lane.target, layers)
	const base = getTargetBase(lane.target, settings, layers)
	if (control === null || base === null) return null
	const baseNormalized = toNormalized(control, base)
	const normalized = evaluatePoints(lane.points, time, baseNormalized)
	return toControlValue(control, normalized)
}

const checkHasPoints = (lane: AutomationLaneT): boolean => lane.points.length > 0

// Frame-time settings: the base settings with every automated
// control replaced by its lane value.
export const applyAutomation = (settings: SettingsT, lanes: AutomationLaneT[], time: number): SettingsT => {
	const settingLanes = lanes.filter((lane) => lane.target.kind === 'setting' && checkHasPoints(lane))
	const hasAutomation = settingLanes.length > 0
	if (!hasAutomation) return settings
	const live: SettingsT = { ...settings }
	for (const lane of settingLanes) {
		const target = lane.target
		if (target.kind !== 'setting') continue
		const value = getLiveLaneValue(lane, settings, [], time)
		if (value === null) continue
		live[target.key] = value
	}
	return live
}

const applyLaneToLayer = (layer: LayerT, lane: AutomationLaneT, value: number): LayerT => {
	const target = lane.target
	if (target.kind === 'layer') {
		const transform = { ...layer.transform, [target.param]: value }
		return { ...layer, transform }
	}
	if (target.kind !== 'fx') return layer
	const fx = layer.fx.map((candidate) => {
		const isTargetFx = candidate.id === target.fxId
		if (!isTargetFx) return candidate
		return { ...candidate, amount: value }
	})
	return { ...layer, fx }
}

// Frame-time layers: copies with every automated param and
// effect amount replaced by its lane value. Untouched layers
// are passed through as they are.
export const applyLayerAutomation = (layers: LayerT[], settings: SettingsT, lanes: AutomationLaneT[], time: number): LayerT[] => {
	const layerLanes = lanes.filter((lane) => lane.target.kind !== 'setting' && checkHasPoints(lane))
	const hasAutomation = layerLanes.length > 0
	if (!hasAutomation) return layers

	return layers.map((layer) => {
		const ownLanes = layerLanes.filter((lane) => getTargetGroupId(lane.target) === layer.id)
		let live = layer
		for (const lane of ownLanes) {
			const value = getLiveLaneValue(lane, settings, layers, time)
			if (value === null) continue
			live = applyLaneToLayer(live, lane, value)
		}
		return live
	})
}

// Every target a layer offers, in menu order: its transform,
// then each effect it carries.
export const listLayerTargets = (layer: LayerT): LaneTargetT[] => {
	const paramTargets: LaneTargetT[] = LAYER_PARAMS.map((spec) => ({ kind: 'layer', layerId: layer.id, param: spec.key }))
	const fxTargets: LaneTargetT[] = layer.fx.map((fx) => ({ kind: 'fx', layerId: layer.id, fxId: fx.id }))
	return [...paramTargets, ...fxTargets]
}

export const listSettingTargets = (): LaneTargetT[] => {
	return AUTOMATION_CONTROLS.map((control) => ({ kind: 'setting', key: control.key }))
}

// Path space: x runs 0-1000 across the visible view, so the
// curve can extend past both edges and gets clipped by the plot.
export type PathViewT = { start: number; span: number }

const toPathX = (time: number, view: PathViewT): number => {
	const ratio = view.span > 0 ? (time - view.start) / view.span : 0
	return ratio * PATH_WIDTH
}

const toPathY = (normalized: number): number => (1 - clamp(normalized, 0, 1)) * PATH_HEIGHT

type PathVertexT = { x: number; y: number }

const buildSegmentVertices = (start: AutomationPointT, end: AutomationPointT, view: PathViewT): PathVertexT[] => {
	const isBent = start.bend !== 0
	const sampleCount = isBent ? BENT_SAMPLES : 1
	const sampleNumbers = Array.from({ length: sampleCount }, (_, index) => index + 1)
	return sampleNumbers.map((sample) => {
		const progress = sample / sampleCount
		const time = start.time + (end.time - start.time) * progress
		const value = interpolateSegment(start, end, time)
		return { x: toPathX(time, view), y: toPathY(value) }
	})
}

// Segments fully outside the view are skipped, except their
// ends, so long songs stay cheap at deep zoom.
const checkIsSegmentVisible = (start: AutomationPointT, end: AutomationPointT, view: PathViewT): boolean => {
	const viewEnd = view.start + view.span
	const isBeforeView = end.time < view.start
	const isAfterView = start.time > viewEnd
	return !isBeforeView && !isAfterView
}

export const buildVertices = (points: AutomationPointT[], view: PathViewT, fallback: number): PathVertexT[] => {
	const leftX = Math.min(0, toPathX(0, view))
	const rightX = PATH_WIDTH
	const hasPoints = points.length > 0
	if (!hasPoints) {
		return [
			{ x: leftX, y: toPathY(fallback) },
			{ x: rightX, y: toPathY(fallback) }
		]
	}
	const first = points[0]
	const last = points[points.length - 1]
	const vertices: PathVertexT[] = [{ x: leftX, y: toPathY(first.value) }]
	vertices.push({ x: toPathX(first.time, view), y: toPathY(first.value) })
	const segmentStarts = points.slice(0, -1)
	for (const [index, start] of segmentStarts.entries()) {
		const end = points[index + 1]
		const isVisible = checkIsSegmentVisible(start, end, view)
		if (!isVisible) {
			vertices.push({ x: toPathX(end.time, view), y: toPathY(end.value) })
			continue
		}
		vertices.push(...buildSegmentVertices(start, end, view))
	}
	const lastX = Math.max(rightX, toPathX(last.time, view))
	vertices.push({ x: lastX, y: toPathY(last.value) })
	return vertices
}

const formatVertex = (vertex: PathVertexT): string => `${vertex.x.toFixed(2)} ${vertex.y.toFixed(2)}`

export const buildLinePath = (vertices: PathVertexT[]): string => {
	const commands = vertices.map((vertex, index) => {
		const verb = index === 0 ? 'M' : 'L'
		return `${verb}${formatVertex(vertex)}`
	})
	return commands.join(' ')
}

export const buildAreaPath = (vertices: PathVertexT[]): string => {
	const line = buildLinePath(vertices)
	const first = vertices[0]
	const last = vertices[vertices.length - 1]
	return `${line} L${last.x.toFixed(2)} ${PATH_HEIGHT} L${first.x.toFixed(2)} ${PATH_HEIGHT} Z`
}

const LANE_TONE_COUNT = 5

const toTone = (index: number): number => (Math.max(0, index) % LANE_TONE_COUNT) + 1

// Each control keeps one color wherever it shows up: lane,
// header dot and the automated badge in the panels.
export const getTargetTone = (target: LaneTargetT, layers: LayerT[]): number => {
	if (target.kind === 'setting') {
		const settingIndex = AUTOMATION_CONTROLS.findIndex((control) => control.key === target.key)
		return toTone(settingIndex)
	}
	if (target.kind === 'layer') {
		const paramIndex = LAYER_PARAMS.findIndex((spec) => spec.key === target.param)
		return toTone(paramIndex)
	}
	const fx = findLayerFx(layers, target.layerId, target.fxId)
	if (fx === undefined) return toTone(0)
	const fxIndex = FX_SPECS.findIndex((spec) => spec.kind === fx.kind)
	return toTone(LAYER_PARAMS.length + fxIndex)
}

export const createPointId = (): string => crypto.randomUUID()
