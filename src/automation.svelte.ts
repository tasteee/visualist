import { clamp } from './engine/settings'
import { MIN_POINT_GAP, createPointId } from './engine/automation'
import type { AutomatableKeyT, AutomationLaneT, AutomationPointT } from './engine/types'

type AutomationStateT = {
	lanes: AutomationLaneT[]
	selectedPointId: string | null
}

export const automation = $state<AutomationStateT>({
	lanes: [],
	selectedPointId: null
})

const findLane = (laneId: string): AutomationLaneT | undefined => {
	return automation.lanes.find((lane) => lane.id === laneId)
}

const findPoint = (lane: AutomationLaneT, pointId: string): AutomationPointT | undefined => {
	return lane.points.find((point) => point.id === pointId)
}

export const addLane = (): void => {
	const lane: AutomationLaneT = { id: crypto.randomUUID(), controlKey: null, points: [] }
	automation.lanes.push(lane)
}

export const removeLane = (laneId: string): void => {
	automation.lanes = automation.lanes.filter((lane) => lane.id !== laneId)
}

export const setLaneControl = (laneId: string, key: AutomatableKeyT): void => {
	const lane = findLane(laneId)
	if (lane === undefined) return
	const isChange = lane.controlKey !== key
	if (!isChange) return
	lane.controlKey = key
	lane.points = []
	automation.selectedPointId = null
}

export const selectPoint = (pointId: string | null): void => {
	automation.selectedPointId = pointId
}

export const addPoint = (laneId: string, time: number, value: number): string | null => {
	const lane = findLane(laneId)
	if (lane === undefined) return null
	const point: AutomationPointT = {
		id: createPointId(),
		time: Math.max(0, time),
		value: clamp(value, 0, 1),
		bend: 0
	}
	const insertIndex = lane.points.findIndex((existing) => existing.time > point.time)
	const isLast = insertIndex === -1
	if (isLast) lane.points.push(point)
	if (!isLast) lane.points.splice(insertIndex, 0, point)
	return point.id
}

// Points never pass their neighbors, so the order stays stable.
export const movePoint = (laneId: string, pointId: string, time: number, value: number, duration: number): void => {
	const lane = findLane(laneId)
	if (lane === undefined) return
	const index = lane.points.findIndex((point) => point.id === pointId)
	if (index === -1) return
	const hasPrevious = index > 0
	const hasNext = index < lane.points.length - 1
	const earliest = hasPrevious ? lane.points[index - 1].time + MIN_POINT_GAP : 0
	const latest = hasNext ? lane.points[index + 1].time - MIN_POINT_GAP : duration
	const point = lane.points[index]
	point.time = clamp(time, earliest, Math.max(earliest, latest))
	point.value = clamp(value, 0, 1)
}

export const setPointBend = (laneId: string, pointId: string, bend: number): void => {
	const lane = findLane(laneId)
	if (lane === undefined) return
	const point = findPoint(lane, pointId)
	if (point === undefined) return
	point.bend = clamp(bend, -1, 1)
}

export const deletePoint = (laneId: string, pointId: string): void => {
	const lane = findLane(laneId)
	if (lane === undefined) return
	lane.points = lane.points.filter((point) => point.id !== pointId)
	const wasSelected = automation.selectedPointId === pointId
	if (wasSelected) automation.selectedPointId = null
}

export const clampLanesToDuration = (duration: number): void => {
	for (const lane of automation.lanes) {
		for (const point of lane.points) point.time = Math.min(point.time, duration)
	}
}
