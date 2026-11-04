import { clamp } from './engine/settings'
import { AUTOMATION_CONTROLS, MIN_POINT_GAP, createPointId, findControl, toNormalized } from './engine/automation'
import type { AutomatableKeyT, AutomationLaneT, AutomationPointT } from './engine/types'
import { app } from './store.svelte'

type AutomationStateT = {
	lanes: AutomationLaneT[]
	selectedPointId: string | null
	collapsedLaneIds: string[]
	revealedLaneId: string | null
	undoDepth: number
	redoDepth: number
}

const HISTORY_LIMIT = 120

export const automation = $state<AutomationStateT>({
	lanes: [],
	selectedPointId: null,
	collapsedLaneIds: [],
	revealedLaneId: null,
	undoDepth: 0,
	redoDepth: 0
})

// History lives outside the proxy: plain snapshots, swapped in
// whole on undo and redo.
const undoStack: AutomationLaneT[][] = []
const redoStack: AutomationLaneT[][] = []

const takeSnapshot = (): AutomationLaneT[] => $state.snapshot(automation.lanes) as AutomationLaneT[]

const syncHistoryDepth = (): void => {
	automation.undoDepth = undoStack.length
	automation.redoDepth = redoStack.length
}

// Call once before every user edit. Drags call it at the start
// of the gesture, so one drag is one undo step.
export const recordHistory = (): void => {
	undoStack.push(takeSnapshot())
	const isOverLimit = undoStack.length > HISTORY_LIMIT
	if (isOverLimit) undoStack.shift()
	redoStack.length = 0
	syncHistoryDepth()
}

const restoreLanes = (lanes: AutomationLaneT[]): void => {
	automation.lanes = lanes
	automation.selectedPointId = null
	const laneIds = lanes.map((lane) => lane.id)
	automation.collapsedLaneIds = automation.collapsedLaneIds.filter((laneId) => laneIds.includes(laneId))
}

export const undo = (): void => {
	const previous = undoStack.pop()
	if (previous === undefined) return
	redoStack.push(takeSnapshot())
	restoreLanes(previous)
	syncHistoryDepth()
}

export const redo = (): void => {
	const next = redoStack.pop()
	if (next === undefined) return
	undoStack.push(takeSnapshot())
	restoreLanes(next)
	syncHistoryDepth()
}

const findLane = (laneId: string): AutomationLaneT | undefined => {
	return automation.lanes.find((lane) => lane.id === laneId)
}

const findPoint = (lane: AutomationLaneT, pointId: string): AutomationPointT | undefined => {
	return lane.points.find((point) => point.id === pointId)
}

const getUsedControlKeys = (): AutomatableKeyT[] => {
	const keys = automation.lanes.map((lane) => lane.controlKey)
	return keys.filter((key): key is AutomatableKeyT => key !== null)
}

const findUnusedControlKey = (): AutomatableKeyT | null => {
	const usedKeys = getUsedControlKeys()
	const unused = AUTOMATION_CONTROLS.find((control) => !usedKeys.includes(control.key))
	return unused === undefined ? null : unused.key
}

export const checkCanAddLane = (): boolean => findUnusedControlKey() !== null

// A new lane starts from the control's current value, so taking
// over a control never changes what is on screen.
const buildSeedPoint = (key: AutomatableKeyT): AutomationPointT => {
	const control = findControl(key)
	const currentValue = app.settings[key]
	const normalized = control === null ? 0 : toNormalized(control, currentValue)
	return { id: createPointId(), time: 0, value: normalized, bend: 0 }
}

export const addLane = (): string | null => {
	const key = findUnusedControlKey()
	if (key === null) return null
	recordHistory()
	const lane: AutomationLaneT = { id: crypto.randomUUID(), controlKey: key, points: [buildSeedPoint(key)] }
	automation.lanes.push(lane)
	return lane.id
}

export const removeLane = (laneId: string): void => {
	recordHistory()
	automation.lanes = automation.lanes.filter((lane) => lane.id !== laneId)
	automation.collapsedLaneIds = automation.collapsedLaneIds.filter((candidate) => candidate !== laneId)
}

export const setLaneControl = (laneId: string, key: AutomatableKeyT): void => {
	const lane = findLane(laneId)
	if (lane === undefined) return
	const isChange = lane.controlKey !== key
	if (!isChange) return
	recordHistory()
	lane.controlKey = key
	lane.points = [buildSeedPoint(key)]
	automation.selectedPointId = null
}

// Clearing keeps one point at the start, holding the value the
// lane had there, so the control does not jump.
export const resetLane = (laneId: string): void => {
	const lane = findLane(laneId)
	if (lane === undefined || lane.controlKey === null) return
	recordHistory()
	const firstPoint = lane.points[0]
	const hasFirstPoint = firstPoint !== undefined
	const seed = buildSeedPoint(lane.controlKey)
	if (hasFirstPoint) seed.value = firstPoint.value
	lane.points = [seed]
	automation.selectedPointId = null
}

export const checkIsLaneCollapsed = (laneId: string): boolean => automation.collapsedLaneIds.includes(laneId)

export const toggleLaneCollapsed = (laneId: string): void => {
	const isCollapsed = checkIsLaneCollapsed(laneId)
	if (isCollapsed) {
		automation.collapsedLaneIds = automation.collapsedLaneIds.filter((candidate) => candidate !== laneId)
		return
	}
	automation.collapsedLaneIds = [...automation.collapsedLaneIds, laneId]
}

export const checkAreAllCollapsed = (): boolean => {
	const hasLanes = automation.lanes.length > 0
	if (!hasLanes) return false
	return automation.lanes.every((lane) => automation.collapsedLaneIds.includes(lane.id))
}

export const toggleAllCollapsed = (): void => {
	const areAllCollapsed = checkAreAllCollapsed()
	if (areAllCollapsed) {
		automation.collapsedLaneIds = []
		return
	}
	automation.collapsedLaneIds = automation.lanes.map((lane) => lane.id)
}

const REVEAL_MS = 1100
let revealTimer = 0

// Expands a lane and asks it to scroll into view and flash,
// for jumping from an automated control to its lane.
export const revealLane = (laneId: string): void => {
	automation.collapsedLaneIds = automation.collapsedLaneIds.filter((candidate) => candidate !== laneId)
	automation.revealedLaneId = laneId
	window.clearTimeout(revealTimer)
	revealTimer = window.setTimeout(() => (automation.revealedLaneId = null), REVEAL_MS)
}

export const selectPoint = (pointId: string | null): void => {
	automation.selectedPointId = pointId
}

export const addPoint = (laneId: string, time: number, value: number): string | null => {
	const lane = findLane(laneId)
	if (lane === undefined) return null
	recordHistory()
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
	recordHistory()
	lane.points = lane.points.filter((point) => point.id !== pointId)
	const wasSelected = automation.selectedPointId === pointId
	if (wasSelected) automation.selectedPointId = null
}

export const clampLanesToDuration = (duration: number): void => {
	for (const lane of automation.lanes) {
		for (const point of lane.points) point.time = Math.min(point.time, duration)
	}
}
