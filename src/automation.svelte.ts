import { clamp } from './engine/settings'
import {
	MIN_POINT_GAP,
	checkIsSameTarget,
	checkIsTargetLive,
	checkIsUnsetTarget,
	createPointId,
	getTargetBase,
	getTargetControl,
	getTargetGroupId,
	listLayerTargets,
	listSettingTargets,
	toNormalized
} from './engine/automation'
import type { AutomationLaneT, AutomationPointT, LaneTargetT, LayerT } from './engine/types'
import { appearance } from './appearance.svelte'
import { findLayer, layerStore } from './layers.svelte'
import { restoreTrackSnapshot, sources, takeTrackSnapshot } from './sources.svelte'
import type { TrackSnapshotT } from './sources.svelte'
import { app, markDirty, setLoopRegion } from './store.svelte'
import type { SettingsT } from './engine/types'

type AutomationStateT = {
	lanes: AutomationLaneT[]
	// The lane whose points are selected, and which ones. A
	// selection lives on one lane at a time.
	selectedPointLaneId: string | null
	selectedPointIds: string[]
	// The last point picked on its own, for shift-range.
	selectedPointId: string | null
	collapsedLaneIds: string[]
	// Groups are 'global' or a layer id.
	collapsedGroupIds: string[]
	revealedLaneId: string | null
	undoDepth: number
	redoDepth: number
}

const HISTORY_LIMIT = 120
const STORAGE_KEY = 'vink.automation.v2'
const LEGACY_STORAGE_KEY = 'vink.automation.v1'

const checkIsTargetShape = (target: unknown): target is LaneTargetT => {
	const isObject = typeof target === 'object' && target !== null
	if (!isObject) return false
	const kind = (target as { kind?: unknown }).kind
	return kind === 'unset' || kind === 'setting' || kind === 'layer' || kind === 'fx'
}

const checkIsLaneShape = (lane: Partial<AutomationLaneT>): boolean => {
	const hasId = typeof lane.id === 'string'
	const hasPoints = Array.isArray(lane.points)
	return hasId && hasPoints && checkIsTargetShape(lane.target)
}

// Lanes are saved with the layers, so layer lanes come back
// with the layers they drive.
// Position used to run from -60 to 60 and now runs from -100 to 100.
// Saved lanes keep the same positions by rescaling their points.
const OLD_POSITION_LIMIT = 60
const NEW_POSITION_LIMIT = 100

const migratePositionLane = (lane: AutomationLaneT): AutomationLaneT => {
	const target = lane.target
	const isPosition = target.kind === 'layer' && (target.param === 'x' || target.param === 'y')
	if (!isPosition) return lane
	const points = lane.points.map((point) => {
		const oldValue = (point.value * 2 - 1) * OLD_POSITION_LIMIT
		return { ...point, value: (oldValue / NEW_POSITION_LIMIT + 1) / 2 }
	})
	return { ...lane, points }
}

const readLegacyLanes = (): AutomationLaneT[] | null => {
	const stored = window.localStorage.getItem(LEGACY_STORAGE_KEY)
	if (stored === null) return null
	const parsed = JSON.parse(stored) as Partial<AutomationLaneT>[]
	if (!Array.isArray(parsed)) return null
	return (parsed.filter(checkIsLaneShape) as AutomationLaneT[]).map(migratePositionLane)
}

const loadLanes = (): AutomationLaneT[] => {
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY)
		if (stored === null) return readLegacyLanes() ?? []
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
	selectedPointLaneId: null,
	selectedPointIds: [],
	selectedPointId: null,
	collapsedLaneIds: [],
	collapsedGroupIds: [],
	revealedLaneId: null,
	undoDepth: 0,
	redoDepth: 0
})

type RegionT = {
	start: number
	end: number
}

type AppearanceSnapshotT = {
	colors: Record<string, string>
	heights: Record<string, number>
	collapsedLaneIds: string[]
	collapsedGroupIds: string[]
	collapsedTrackIds: string[]
	isTriggersCollapsed: boolean
}

// One undo step: everything the user can change in the editor.
// Lanes, the layer list with its params and effects, impulse
// tracks, row looks, loop and export range, and the base
// controls. Drags record once, so one gesture is one step.
type HistoryEntryT = {
	lanes: AutomationLaneT[]
	layers: LayerT[]
	impulseTracks: TrackSnapshotT
	settings: SettingsT
	appearance: AppearanceSnapshotT
	loop: RegionT
	isLoopEnabled: boolean
	exportRange: RegionT
	selectedLayerId: string | null
}

// History lives outside the proxy: plain snapshots, swapped in
// whole on undo and redo.
const undoStack: HistoryEntryT[] = []
const redoStack: HistoryEntryT[] = []

const takeAppearanceSnapshot = (): AppearanceSnapshotT => ({
	colors: { ...appearance.colors },
	heights: { ...appearance.heights },
	collapsedLaneIds: [...automation.collapsedLaneIds],
	collapsedGroupIds: [...automation.collapsedGroupIds],
	collapsedTrackIds: [...sources.collapsedTrackIds],
	isTriggersCollapsed: sources.isTriggersCollapsed
})

const takeSnapshot = (): HistoryEntryT => ({
	lanes: $state.snapshot(automation.lanes) as AutomationLaneT[],
	layers: $state.snapshot(layerStore.layers) as LayerT[],
	impulseTracks: takeTrackSnapshot(),
	settings: $state.snapshot(app.settings) as SettingsT,
	appearance: takeAppearanceSnapshot(),
	loop: { start: app.loopStart, end: app.loopEnd },
	isLoopEnabled: app.isLoopEnabled,
	exportRange: { start: app.trimStart, end: app.trimEnd },
	selectedLayerId: layerStore.selectedLayerId
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
	lastCoalescedKey = null
	syncHistoryDepth()
}

// Sliders and number fields send a stream of changes. Edits
// with the same key inside the window share one undo step.
const COALESCE_WINDOW_MS = 900
let lastCoalescedKey: string | null = null
let lastCoalescedAt = 0

export const recordHistoryCoalesced = (key: string): void => {
	const now = performance.now()
	const isSameKey = lastCoalescedKey === key
	const isRecent = now - lastCoalescedAt < COALESCE_WINDOW_MS
	lastCoalescedAt = now
	if (isSameKey && isRecent) return
	recordHistory()
	lastCoalescedKey = key
}

const getLayers = (): LayerT[] => layerStore.layers as LayerT[]

// Undo can bring back a lane whose layer has since been
// deleted, so restored lanes are checked against the layers.
const restoreLanes = (lanes: AutomationLaneT[], layers: LayerT[]): void => {
	automation.lanes = lanes.filter((lane) => checkIsTargetLive(lane.target, layers))
	automation.selectedPointId = null
	automation.selectedPointIds = []
	automation.selectedPointLaneId = null
	const laneIds = lanes.map((lane) => lane.id)
	automation.collapsedLaneIds = automation.collapsedLaneIds.filter((laneId) => laneIds.includes(laneId))
}

const restoreAppearance = (snapshot: AppearanceSnapshotT): void => {
	appearance.colors = snapshot.colors as typeof appearance.colors
	appearance.heights = snapshot.heights
	automation.collapsedLaneIds = snapshot.collapsedLaneIds
	automation.collapsedGroupIds = snapshot.collapsedGroupIds
	sources.collapsedTrackIds = snapshot.collapsedTrackIds
	sources.isTriggersCollapsed = snapshot.isTriggersCollapsed
}

const restoreEntry = (entry: HistoryEntryT): void => {
	layerStore.layers = entry.layers
	const isSelectionLive = entry.selectedLayerId === null || findLayer(entry.selectedLayerId) !== undefined
	layerStore.selectedLayerId = isSelectionLive ? entry.selectedLayerId : null
	restoreLanes(entry.lanes, entry.layers)
	restoreTrackSnapshot(entry.impulseTracks)
	Object.assign(app.settings, entry.settings)
	restoreAppearance(entry.appearance)
	app.trimStart = entry.exportRange.start
	app.trimEnd = entry.exportRange.end
	app.isLoopEnabled = entry.isLoopEnabled
	setLoopRegion(entry.loop.start, entry.loop.end)
	markDirty()
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

export const checkCanAddSettingLane = (groupId: string): boolean => findUnusedTarget(listSettingTargets(groupId)) !== null

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

// An unset lane has no control to seed from, so it starts
// empty and is seeded when a control is picked.
const buildStartingPoints = (target: LaneTargetT): AutomationPointT[] => {
	const isUnset = checkIsUnsetTarget(target)
	if (isUnset) return []
	return [buildSeedPoint(target)]
}

const pushLane = (target: LaneTargetT): string => {
	recordHistory()
	const lane: AutomationLaneT = { id: crypto.randomUUID(), target, points: buildStartingPoints(target) }
	automation.lanes.push(lane)
	expandGroup(getTargetGroupId(target))
	return lane.id
}

// New lanes start unmapped. The user picks the control from
// the lane's own menu.
export const addSettingLane = (groupId: string): string | null => {
	const canAdd = checkCanAddSettingLane(groupId)
	if (!canAdd) return null
	return pushLane({ kind: 'unset', groupId })
}

export const addLayerLane = (layerId: string): string | null => {
	const canAdd = checkCanAddLayerLane(layerId)
	if (!canAdd) return null
	return pushLane({ kind: 'unset', groupId: layerId })
}

// From a panel control: opens its lane if it has one, makes
// one if not, and brings it into view either way.
export const automateTarget = (target: LaneTargetT): void => {
	const existing = automation.lanes.find((lane) => checkIsSameTarget(lane.target, target))
	const laneId = existing === undefined ? pushLane(target) : existing.id
	revealLane(laneId)
}

export const removeLanes = (laneIds: string[]): void => {
	const hasLanes = laneIds.length > 0
	if (!hasLanes) return
	recordHistory()
	const doomedIds = new Set(laneIds)
	automation.lanes = automation.lanes.filter((lane) => !doomedIds.has(lane.id))
	automation.collapsedLaneIds = automation.collapsedLaneIds.filter((candidate) => !doomedIds.has(candidate))
	clearPointSelection()
}

export const removeLane = (laneId: string): void => removeLanes([laneId])

// Layer and effect removal takes their lanes along. The undo
// step is recorded by whoever removes the layer.
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
	clearPointSelection()
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
	clearPointSelection()
}

// A name commits once, as the whole name. A blank name goes
// back to the control's own.
export const renameLane = (laneId: string, name: string): void => {
	const lane = findLane(laneId)
	if (lane === undefined) return
	recordHistory()
	const trimmed = name.trim().slice(0, 40)
	const isBlank = trimmed.length === 0
	lane.name = isBlank ? undefined : trimmed
}

export const toggleLaneBypassed = (laneId: string): void => {
	const lane = findLane(laneId)
	if (lane === undefined) return
	recordHistory()
	lane.isBypassed = lane.isBypassed !== true
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

// ---- Point selection ----------------------------------------

export const clearPointSelection = (): void => {
	automation.selectedPointLaneId = null
	automation.selectedPointIds = []
	automation.selectedPointId = null
}

export const selectPoints = (laneId: string, pointIds: string[], anchorId: string | null): void => {
	automation.selectedPointLaneId = laneId
	automation.selectedPointIds = pointIds
	automation.selectedPointId = anchorId
}

export const checkIsPointSelected = (laneId: string, pointId: string): boolean => {
	const isLane = automation.selectedPointLaneId === laneId
	if (!isLane) return false
	return automation.selectedPointIds.includes(pointId)
}

export const getSelectedPointCount = (laneId: string): number => {
	const isLane = automation.selectedPointLaneId === laneId
	if (!isLane) return 0
	return automation.selectedPointIds.length
}

const getSelectedIdsOnLane = (laneId: string): string[] => {
	const isLane = automation.selectedPointLaneId === laneId
	if (!isLane) return []
	return automation.selectedPointIds
}

export const togglePointSelected = (laneId: string, pointId: string): void => {
	const currentIds = getSelectedIdsOnLane(laneId)
	const isSelected = currentIds.includes(pointId)
	const nextIds = isSelected ? currentIds.filter((candidate) => candidate !== pointId) : [...currentIds, pointId]
	selectPoints(laneId, nextIds, pointId)
}

// Shift-click: everything between the last plainly picked point
// and this one, on the same lane.
export const selectPointRange = (laneId: string, pointId: string): void => {
	const lane = findLane(laneId)
	if (lane === undefined) return
	const anchorId = automation.selectedPointId
	const isAnchorOnLane = automation.selectedPointLaneId === laneId && anchorId !== null
	if (!isAnchorOnLane) return selectPoints(laneId, [pointId], pointId)
	const anchorIndex = lane.points.findIndex((point) => point.id === anchorId)
	const targetIndex = lane.points.findIndex((point) => point.id === pointId)
	const hasBoth = anchorIndex !== -1 && targetIndex !== -1
	if (!hasBoth) return selectPoints(laneId, [pointId], pointId)
	const first = Math.min(anchorIndex, targetIndex)
	const last = Math.max(anchorIndex, targetIndex)
	const rangeIds = lane.points.slice(first, last + 1).map((point) => point.id)
	selectPoints(laneId, rangeIds, anchorId)
}

export const selectAllPoints = (laneId: string): void => {
	const lane = findLane(laneId)
	if (lane === undefined) return
	selectPoints(laneId, lane.points.map((point) => point.id), null)
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
	selectPoints(laneId, [point.id], point.id)
	return point.id
}

// The value a new point starts from: level with the point
// before it, or the lane's base value when there is none.
export const getValueForNewPoint = (laneId: string, time: number): number => {
	const lane = findLane(laneId)
	if (lane === undefined) return 0
	const earlierPoints = lane.points.filter((point) => point.time <= time)
	const previous = earlierPoints[earlierPoints.length - 1]
	const hasPrevious = previous !== undefined
	if (hasPrevious) return previous.value
	const control = getTargetControl(lane.target, getLayers())
	const base = getTargetBase(lane.target, app.settings, getLayers())
	const hasBase = control !== null && base !== null
	return hasBase ? toNormalized(control, base) : 0
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

export type PointMoveT = {
	pointId: string
	time: number
	value: number
}

// Moves several points as one gesture. Each keeps its place in
// the order, so the group can not fold over a neighbor.
export const movePoints = (laneId: string, moves: PointMoveT[], duration: number): void => {
	const sortedMoves = [...moves].sort((first, second) => first.time - second.time)
	for (const move of sortedMoves) movePoint(laneId, move.pointId, move.time, move.value, duration)
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
	const remainingIds = automation.selectedPointIds.filter((candidate) => candidate !== pointId)
	automation.selectedPointIds = remainingIds
	const wasAnchor = automation.selectedPointId === pointId
	if (wasAnchor) automation.selectedPointId = null
}

// One undo step for the whole selection.
export const deleteSelectedPoints = (): void => {
	const laneId = automation.selectedPointLaneId
	if (laneId === null) return
	const lane = findLane(laneId)
	const hasSelection = automation.selectedPointIds.length > 0
	if (lane === undefined || !hasSelection) return
	recordHistory()
	const doomedIds = new Set(automation.selectedPointIds)
	lane.points = lane.points.filter((point) => !doomedIds.has(point.id))
	clearPointSelection()
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
