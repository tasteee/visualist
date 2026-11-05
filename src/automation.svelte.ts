import { clamp } from './engine/settings'
import {
	MIN_POINT_GAP,
	checkIsSameTarget,
	checkIsTargetLive,
	createPointId,
	getTargetBase,
	getTargetControl,
	getTargetGroupId,
	listLayerTargets,
	listSettingTargets,
	toNormalized
} from './engine/automation'
import type { AutomationLaneT, AutomationPointT, LaneTargetT, LayerT } from './engine/types'
import { findLayer, layerStore } from './layers.svelte'
import { restoreTrackSnapshot, takeTrackSnapshot } from './sources.svelte'
import type { TrackSnapshotT } from './sources.svelte'
import { app } from './store.svelte'

type AutomationStateT = {
	lanes: AutomationLaneT[]
	selectedPointId: string | null
	collapsedLaneIds: string[]
	// Groups are 'global' or a layer id.
	collapsedGroupIds: string[]
	revealedLaneId: string | null
	undoDepth: number
	redoDepth: number
}

const HISTORY_LIMIT = 120
const STORAGE_KEY = 'vink.automation.v1'

const checkIsTargetShape = (target: unknown): target is LaneTargetT => {
	const isObject = typeof target === 'object' && target !== null
	if (!isObject) return false
	const kind = (target as { kind?: unknown }).kind
	return kind === 'setting' || kind === 'layer' || kind === 'fx'
}

const checkIsLaneShape = (lane: Partial<AutomationLaneT>): boolean => {
	const hasId = typeof lane.id === 'string'
	const hasPoints = Array.isArray(lane.points)
	return hasId && hasPoints && checkIsTargetShape(lane.target)
}

// Lanes are saved with the layers, so layer lanes come back
// with the layers they drive.
const loadLanes = (): AutomationLaneT[] => {
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY)
		if (stored === null) return []
		const parsed = JSON.parse(stored) as Partial<AutomationLaneT>[]
		const isList = Array.isArray(parsed)
		if (!isList) return []
		return parsed.filter(checkIsLaneShape) as AutomationLaneT[]
	} catch {
		return []
	}
}

const saveLanes = (lanes: AutomationLaneT[]): void => {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lanes))
	} catch {
		return
	}
}

export const automation = $state<AutomationStateT>({
	lanes: loadLanes(),
	selectedPointId: null,
	collapsedLaneIds: [],
	collapsedGroupIds: [],
	revealedLaneId: null,
	undoDepth: 0,
	redoDepth: 0
})

type LayerTimingT = {
	startTime: number
	endTime: number | null
}

// One undo step: every lane, plus each layer's timing, the
// stack order and the hit tracks, so clip drags, reorders and
// hit edits all undo with the lanes.
type HistoryEntryT = {
	lanes: AutomationLaneT[]
	layerTimings: Record<string, LayerTimingT>
	layerOrder: string[]
	hitTracks: TrackSnapshotT
}

// History lives outside the proxy: plain snapshots, swapped in
// whole on undo and redo.
const undoStack: HistoryEntryT[] = []
const redoStack: HistoryEntryT[] = []

const readLayerTimings = (): Record<string, LayerTimingT> => {
	const timings: Record<string, LayerTimingT> = {}
	for (const layer of layerStore.layers) {
		timings[layer.id] = { startTime: layer.startTime, endTime: layer.endTime }
	}
	return timings
}

const takeSnapshot = (): HistoryEntryT => ({
	lanes: $state.snapshot(automation.lanes) as AutomationLaneT[],
	layerTimings: readLayerTimings(),
	layerOrder: layerStore.layers.map((layer) => layer.id),
	hitTracks: takeTrackSnapshot()
})

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

const getLayers = (): LayerT[] => layerStore.layers as LayerT[]

// Undo can bring back a lane whose layer has since been
// deleted, so restored lanes are checked against the layers.
const restoreLanes = (lanes: AutomationLaneT[]): void => {
	automation.lanes = lanes.filter((lane) => checkIsTargetLive(lane.target, getLayers()))
	automation.selectedPointId = null
	const laneIds = lanes.map((lane) => lane.id)
	automation.collapsedLaneIds = automation.collapsedLaneIds.filter((laneId) => laneIds.includes(laneId))
}

const restoreLayerTimings = (timings: Record<string, LayerTimingT>): void => {
	for (const layer of layerStore.layers) {
		const timing = timings[layer.id]
		if (timing === undefined) continue
		layer.startTime = timing.startTime
		layer.endTime = timing.endTime
	}
}

// Layers added after the snapshot keep their place at the front,
// in their current order, since the snapshot never saw them.
const restoreLayerOrder = (order: string[]): void => {
	const orderedLayers = order.map((layerId) => findLayer(layerId))
	const knownLayers = orderedLayers.filter((layer): layer is LayerT => layer !== undefined)
	const newerLayers = layerStore.layers.filter((layer) => !order.includes(layer.id))
	layerStore.layers = [...knownLayers, ...newerLayers]
}

const restoreEntry = (entry: HistoryEntryT): void => {
	restoreLanes(entry.lanes)
	restoreLayerTimings(entry.layerTimings)
	restoreLayerOrder(entry.layerOrder)
	restoreTrackSnapshot(entry.hitTracks)
}

export const undo = (): void => {
	const previous = undoStack.pop()
	if (previous === undefined) return
	redoStack.push(takeSnapshot())
	restoreEntry(previous)
	syncHistoryDepth()
}

export const redo = (): void => {
	const next = redoStack.pop()
	if (next === undefined) return
	undoStack.push(takeSnapshot())
	restoreEntry(next)
	syncHistoryDepth()
}

const findLane = (laneId: string): AutomationLaneT | undefined => {
	return automation.lanes.find((lane) => lane.id === laneId)
}

const findPoint = (lane: AutomationLaneT, pointId: string): AutomationPointT | undefined => {
	return lane.points.find((point) => point.id === pointId)
}

const checkIsTargetUsed = (target: LaneTargetT): boolean => {
	return automation.lanes.some((lane) => checkIsSameTarget(lane.target, target))
}

const findUnusedTarget = (targets: LaneTargetT[]): LaneTargetT | null => {
	const unused = targets.find((target) => !checkIsTargetUsed(target))
	return unused ?? null
}

// Opacity and scale are what most layer lanes are for, so a
// new lane on a layer offers those first.
const LAYER_LANE_ORDER = ['opacity', 'scale']

const getLaneOrderRank = (target: LaneTargetT): number => {
	const isParam = target.kind === 'layer'
	if (!isParam) return LAYER_LANE_ORDER.length
	const rank = LAYER_LANE_ORDER.indexOf(target.param)
	const isPreferred = rank !== -1
	if (!isPreferred) return LAYER_LANE_ORDER.length
	return rank
}

const getLayerTargetsInLaneOrder = (layer: LayerT): LaneTargetT[] => {
	const targets = listLayerTargets(layer)
	return [...targets].sort((first, second) => getLaneOrderRank(first) - getLaneOrderRank(second))
}

export const checkCanAddSettingLane = (): boolean => findUnusedTarget(listSettingTargets()) !== null

export const checkCanAddLayerLane = (layerId: string): boolean => {
	const layer = findLayer(layerId)
	if (layer === undefined) return false
	return findUnusedTarget(listLayerTargets(layer)) !== null
}

// A new lane starts from the control's current value, so taking
// over a control never changes what is on screen.
const buildSeedPoint = (target: LaneTargetT): AutomationPointT => {
	const control = getTargetControl(target, getLayers())
	const base = getTargetBase(target, app.settings, getLayers())
	const hasValue = control !== null && base !== null
	const normalized = hasValue ? toNormalized(control, base) : 0
	return { id: createPointId(), time: 0, value: normalized, bend: 0 }
}

const pushLane = (target: LaneTargetT): string => {
	recordHistory()
	const lane: AutomationLaneT = { id: crypto.randomUUID(), target, points: [buildSeedPoint(target)] }
	automation.lanes.push(lane)
	expandGroup(getTargetGroupId(target))
	return lane.id
}

export const addSettingLane = (): string | null => {
	const target = findUnusedTarget(listSettingTargets())
	if (target === null) return null
	return pushLane(target)
}

export const addLayerLane = (layerId: string): string | null => {
	const layer = findLayer(layerId)
	if (layer === undefined) return null
	const target = findUnusedTarget(getLayerTargetsInLaneOrder(layer))
	if (target === null) return null
	return pushLane(target)
}

// From a panel control: opens its lane if it has one, makes
// one if not, and brings it into view either way.
export const automateTarget = (target: LaneTargetT): void => {
	const existing = automation.lanes.find((lane) => checkIsSameTarget(lane.target, target))
	const laneId = existing === undefined ? pushLane(target) : existing.id
	revealLane(laneId)
}

export const removeLane = (laneId: string): void => {
	recordHistory()
	automation.lanes = automation.lanes.filter((lane) => lane.id !== laneId)
	automation.collapsedLaneIds = automation.collapsedLaneIds.filter((candidate) => candidate !== laneId)
}

// Layer and effect removal takes their lanes along. It is not
// an undo step, since the layer itself cannot be undone.
export const removeLanesForLayer = (layerId: string): void => {
	automation.lanes = automation.lanes.filter((lane) => getTargetGroupId(lane.target) !== layerId)
}

export const removeLanesForFx = (fxId: string): void => {
	automation.lanes = automation.lanes.filter((lane) => lane.target.kind !== 'fx' || lane.target.fxId !== fxId)
}

export const setLaneTarget = (laneId: string, target: LaneTargetT): void => {
	const lane = findLane(laneId)
	if (lane === undefined) return
	const isChange = !checkIsSameTarget(lane.target, target)
	if (!isChange) return
	recordHistory()
	lane.target = target
	lane.points = [buildSeedPoint(target)]
	automation.selectedPointId = null
}

// Clearing keeps one point at the start, holding the value the
// lane had there, so the control does not jump.
export const resetLane = (laneId: string): void => {
	const lane = findLane(laneId)
	if (lane === undefined) return
	recordHistory()
	const firstPoint = lane.points[0]
	const hasFirstPoint = firstPoint !== undefined
	const seed = buildSeedPoint(lane.target)
	if (hasFirstPoint) seed.value = firstPoint.value
	lane.points = [seed]
	automation.selectedPointId = null
}

export const getLanesInGroup = (groupId: string): AutomationLaneT[] => {
	return automation.lanes.filter((lane) => getTargetGroupId(lane.target) === groupId)
}

export const checkIsGroupCollapsed = (groupId: string): boolean => automation.collapsedGroupIds.includes(groupId)

const expandGroup = (groupId: string): void => {
	automation.collapsedGroupIds = automation.collapsedGroupIds.filter((candidate) => candidate !== groupId)
}

export const toggleGroupCollapsed = (groupId: string): void => {
	const isCollapsed = checkIsGroupCollapsed(groupId)
	if (isCollapsed) return expandGroup(groupId)
	automation.collapsedGroupIds = [...automation.collapsedGroupIds, groupId]
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
	const lane = findLane(laneId)
	if (lane !== undefined) expandGroup(getTargetGroupId(lane.target))
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

export const startAutomationWatchers = (): void => {
	$effect.root(() => {
		$effect(() => {
			saveLanes($state.snapshot(automation.lanes) as AutomationLaneT[])
		})
	})
}
