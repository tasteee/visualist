import {
	automation,
	clearPointSelection,
	deleteSelectedPoints,
	removeLanes,
	selectPointRange,
	selectPoints,
	togglePointSelected
} from './automation.svelte'
import { layerStore, removeLayers, selectLayers } from './layers.svelte'
import {
	addImpulsesToSelection,
	clearImpulseSelection,
	deleteSelectedImpulses,
	findTrack,
	selectImpulses,
	sources,
	toggleImpulseSelected
} from './sources.svelte'

// One selection model everywhere. Click replaces. Shift-click
// takes the contiguous range from the last plain pick, inside
// one list. The primary modifier toggles. Escape clears. Delete
// removes. Only one kind of thing is selected at a time.
export type PickModifiersT = {
	isRange: boolean
	isToggle: boolean
}

type SelectionStateT = {
	laneIds: string[]
	anchorLaneId: string | null
}

export const selection = $state<SelectionStateT>({ laneIds: [], anchorLaneId: null })

let layerAnchorId: string | null = null
let impulseAnchorId: string | null = null

export const readModifiers = (event: MouseEvent | PointerEvent | KeyboardEvent): PickModifiersT => ({
	isRange: event.shiftKey,
	isToggle: event.metaKey || event.ctrlKey
})

const clearLaneSelection = (): void => {
	selection.laneIds = []
	selection.anchorLaneId = null
}

const clearLayerSelection = (): void => {
	selectLayers([], null)
	layerAnchorId = null
}

const resetImpulseSelection = (): void => {
	clearImpulseSelection()
	impulseAnchorId = null
}

type SelectionKindT = 'none' | 'layer' | 'lane' | 'point' | 'impulse'

// Starting a selection of one kind drops the other kinds.
const clearOtherKinds = (keep: SelectionKindT): void => {
	if (keep !== 'layer') clearLayerSelection()
	if (keep !== 'lane') clearLaneSelection()
	if (keep !== 'point') clearPointSelection()
	if (keep !== 'impulse') resetImpulseSelection()
}

export const clearSelection = (): void => {
	clearOtherKinds('none')
}

export const checkHasSelection = (): boolean => {
	const hasLayers = layerStore.selectedLayerIds.length > 0
	const hasLanes = selection.laneIds.length > 0
	const hasPoints = automation.selectedPointIds.length > 0
	const hasImpulses = sources.impulseSelection.impulseIds.length > 0
	return hasLayers || hasLanes || hasPoints || hasImpulses
}

const pickFromList = (currentIds: string[], anchorId: string | null, targetId: string, orderedIds: string[], modifiers: PickModifiersT): string[] => {
	if (modifiers.isToggle) {
		const isSelected = currentIds.includes(targetId)
		return isSelected ? currentIds.filter((candidate) => candidate !== targetId) : [...currentIds, targetId]
	}
	const hasAnchor = anchorId !== null && orderedIds.includes(anchorId)
	if (modifiers.isRange && hasAnchor) {
		const anchorIndex = orderedIds.indexOf(anchorId)
		const targetIndex = orderedIds.indexOf(targetId)
		const first = Math.min(anchorIndex, targetIndex)
		const last = Math.max(anchorIndex, targetIndex)
		return orderedIds.slice(first, last + 1)
	}
	return [targetId]
}

// ---- Layers -------------------------------------------------

// orderedIds is the list the click happened in, as shown.
export const pickLayer = (layerId: string, orderedIds: string[], modifiers: PickModifiersT): void => {
	const previousIds = layerStore.selectedLayerIds
	clearOtherKinds('layer')
	const nextIds = pickFromList(previousIds, layerAnchorId, layerId, orderedIds, modifiers)
	const isExtending = modifiers.isRange || modifiers.isToggle
	if (!isExtending) layerAnchorId = layerId
	const isStillSelected = nextIds.includes(layerId)
	const primaryId = isStillSelected ? layerId : (nextIds[nextIds.length - 1] ?? null)
	selectLayers(nextIds, primaryId)
}

// ---- Lanes --------------------------------------------------

export const pickLane = (laneId: string, orderedIds: string[], modifiers: PickModifiersT): void => {
	const previousIds = selection.laneIds
	clearOtherKinds('lane')
	const nextIds = pickFromList(previousIds, selection.anchorLaneId, laneId, orderedIds, modifiers)
	const isExtending = modifiers.isRange || modifiers.isToggle
	if (!isExtending) selection.anchorLaneId = laneId
	selection.laneIds = nextIds
}

export const checkIsLaneSelected = (laneId: string): boolean => selection.laneIds.includes(laneId)

// ---- Points -------------------------------------------------

export const pickPoint = (laneId: string, pointId: string, modifiers: PickModifiersT): void => {
	clearOtherKinds('point')
	if (modifiers.isToggle) return togglePointSelected(laneId, pointId)
	if (modifiers.isRange) return selectPointRange(laneId, pointId)
	selectPoints(laneId, [pointId], pointId)
}

export const pickPointsInBox = (laneId: string, pointIds: string[], isAdditive: boolean): void => {
	const isSameLane = automation.selectedPointLaneId === laneId
	const currentIds = isAdditive && isSameLane ? [...automation.selectedPointIds] : []
	clearOtherKinds('point')
	const merged = Array.from(new Set([...currentIds, ...pointIds]))
	selectPoints(laneId, merged, null)
}

// A point that was just placed is the only selection.
export const selectPlacedPoint = (laneId: string, pointId: string): void => {
	clearOtherKinds('point')
	selectPoints(laneId, [pointId], pointId)
}

// ---- Impulses -----------------------------------------------

export const pickImpulse = (trackId: string, impulseId: string, modifiers: PickModifiersT): void => {
	const track = findTrack(trackId)
	if (track === undefined) return
	const orderedIds = track.impulses.map((impulse) => impulse.id)
	const isSameTrack = sources.impulseSelection.trackId === trackId
	const currentIds = isSameTrack ? [...sources.impulseSelection.impulseIds] : []
	clearOtherKinds('impulse')
	if (modifiers.isToggle) {
		const isSelected = currentIds.includes(impulseId)
		const toggledIds = isSelected ? currentIds.filter((candidate) => candidate !== impulseId) : [...currentIds, impulseId]
		return selectImpulses(trackId, toggledIds)
	}
	const nextIds = pickFromList(currentIds, impulseAnchorId, impulseId, orderedIds, modifiers)
	if (!modifiers.isRange) impulseAnchorId = impulseId
	selectImpulses(trackId, nextIds)
}

export const pickImpulsesInBox = (trackId: string, impulseIds: string[], isAdditive: boolean): void => {
	const isSameTrack = sources.impulseSelection.trackId === trackId
	const currentIds = isAdditive && isSameTrack ? [...sources.impulseSelection.impulseIds] : []
	clearOtherKinds('impulse')
	const merged = Array.from(new Set([...currentIds, ...impulseIds]))
	selectImpulses(trackId, merged)
}

export const selectPlacedImpulse = (trackId: string, impulseId: string): void => {
	clearOtherKinds('impulse')
	impulseAnchorId = impulseId
	selectImpulses(trackId, [impulseId])
}

// ---- Delete -------------------------------------------------

// True when something was deleted. Each kind is one undo step.
export const deleteSelection = (): boolean => {
	const hasImpulses = sources.impulseSelection.impulseIds.length > 0
	if (hasImpulses) {
		deleteSelectedImpulses()
		return true
	}
	const hasPoints = automation.selectedPointIds.length > 0
	if (hasPoints) {
		deleteSelectedPoints()
		return true
	}
	const hasLanes = selection.laneIds.length > 0
	if (hasLanes) {
		removeLanes(selection.laneIds)
		clearLaneSelection()
		return true
	}
	const hasLayers = layerStore.selectedLayerIds.length > 0
	if (hasLayers) {
		removeLayers(layerStore.selectedLayerIds)
		clearLayerSelection()
		return true
	}
	return false
}
