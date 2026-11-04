import { clamp } from './settings'
import type {
	AutomatableKeyT,
	AutomationControlT,
	AutomationLaneT,
	AutomationPointT,
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
	{ key: 'solidAmount', label: 'Solids amount', min: 0, max: 2, step: 0.05 }
]

export const findControl = (key: AutomatableKeyT | null): AutomationControlT | null => {
	if (key === null) return null
	const control = AUTOMATION_CONTROLS.find((candidate) => candidate.key === key)
	return control ?? null
}

export const toNormalized = (control: AutomationControlT, value: number): number => {
	const range = control.max - control.min
	return clamp((value - control.min) / range, 0, 1)
}

export const toControlValue = (control: AutomationControlT, normalized: number): number => {
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

export const checkIsAutomated = (lanes: AutomationLaneT[], key: AutomatableKeyT): boolean => {
	return lanes.some((lane) => lane.controlKey === key && lane.points.length > 0)
}

export const getLiveControlValue = (
	lane: AutomationLaneT,
	settings: SettingsT,
	time: number
): number | null => {
	const control = findControl(lane.controlKey)
	if (control === null || lane.controlKey === null) return null
	const baseNormalized = toNormalized(control, settings[lane.controlKey])
	const normalized = evaluatePoints(lane.points, time, baseNormalized)
	return toControlValue(control, normalized)
}

// Frame-time settings: the base settings with every automated
// control replaced by its lane value.
export const applyAutomation = (
	settings: SettingsT,
	lanes: AutomationLaneT[],
	time: number
): SettingsT => {
	const automatedLanes = lanes.filter((lane) => lane.points.length > 0 && lane.controlKey !== null)
	const hasAutomation = automatedLanes.length > 0
	if (!hasAutomation) return settings
	const live: SettingsT = { ...settings }
	for (const lane of automatedLanes) {
		const value = getLiveControlValue(lane, settings, time)
		if (value === null || lane.controlKey === null) continue
		live[lane.controlKey] = value
	}
	return live
}

const toPathX = (time: number, duration: number): number => {
	const ratio = duration > 0 ? time / duration : 0
	return clamp(ratio, 0, 1) * PATH_WIDTH
}

const toPathY = (normalized: number): number => (1 - clamp(normalized, 0, 1)) * PATH_HEIGHT

type PathVertexT = { x: number; y: number }

const buildSegmentVertices = (start: AutomationPointT, end: AutomationPointT, duration: number): PathVertexT[] => {
	const isBent = start.bend !== 0
	const sampleCount = isBent ? BENT_SAMPLES : 1
	const vertices: PathVertexT[] = []
	for (let sample = 1; sample <= sampleCount; sample++) {
		const progress = sample / sampleCount
		const time = start.time + (end.time - start.time) * progress
		const value = interpolateSegment(start, end, time)
		vertices.push({ x: toPathX(time, duration), y: toPathY(value) })
	}
	return vertices
}

export const buildVertices = (points: AutomationPointT[], duration: number, fallback: number): PathVertexT[] => {
	const hasPoints = points.length > 0
	if (!hasPoints) {
		return [
			{ x: 0, y: toPathY(fallback) },
			{ x: PATH_WIDTH, y: toPathY(fallback) }
		]
	}
	const first = points[0]
	const last = points[points.length - 1]
	const vertices: PathVertexT[] = [{ x: 0, y: toPathY(first.value) }]
	vertices.push({ x: toPathX(first.time, duration), y: toPathY(first.value) })
	for (let index = 0; index < points.length - 1; index++) {
		const segment = buildSegmentVertices(points[index], points[index + 1], duration)
		vertices.push(...segment)
	}
	vertices.push({ x: PATH_WIDTH, y: toPathY(last.value) })
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
	return `${line} L${PATH_WIDTH} ${PATH_HEIGHT} L0 ${PATH_HEIGHT} Z`
}

export const createPointId = (): string => crypto.randomUUID()
