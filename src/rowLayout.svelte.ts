import { appearance, getRowHeight, resetRowHeight } from './appearance.svelte'
import { automation, recordHistory, recordHistoryCoalesced } from './automation.svelte'
import { clamp } from './engine/settings'
import { sources } from './sources.svelte'

// Height and fold for every row in the timeline. A row is
// either at least its minimum height, or folded to one compact
// line. It never rests in between.
export type RowKindT = 'layer' | 'lane' | 'impulse'

type RowSpecT = {
	minHeight: number
	foldHeight: number
	defaultHeight: number
	// Dragging an open row shorter than this folds it. Dragging
	// a folded row taller than the other number opens it. The gap
	// keeps a drag from flickering at the edge.
	foldBelow: number
	unfoldAbove: number
}

export const ROW_SPECS: Record<RowKindT, RowSpecT> = {
	layer: { minHeight: 64, foldHeight: 64, defaultHeight: 64, foldBelow: 48, unfoldAbove: 76 },
	lane: { minHeight: 72, foldHeight: 28, defaultHeight: 96, foldBelow: 56, unfoldAbove: 44 },
	impulse: { minHeight: 72, foldHeight: 28, defaultHeight: 72, foldBelow: 56, unfoldAbove: 44 }
}

export const MAX_ROW_HEIGHT = 320

export type RowRefT = {
	kind: RowKindT
	id: string
}

type RowResolutionT = {
	isFolded: boolean
	height: number
}

// ---- Fold state ---------------------------------------------

export const checkIsRowFolded = (row: RowRefT): boolean => {
	if (row.kind === 'lane') return automation.collapsedLaneIds.includes(row.id)
	if (row.kind === 'impulse') return sources.collapsedTrackIds.includes(row.id)
	return automation.collapsedGroupIds.includes(row.id)
}

const withoutId = (ids: string[], id: string): string[] => ids.filter((candidate) => candidate !== id)

const withId = (ids: string[], id: string): string[] => {
	const isPresent = ids.includes(id)
	if (isPresent) return ids
	return [...ids, id]
}

export const setRowFolded = (row: RowRefT, isFolded: boolean): void => {
	if (row.kind === 'lane') {
		const laneIds = automation.collapsedLaneIds
		automation.collapsedLaneIds = isFolded ? withId(laneIds, row.id) : withoutId(laneIds, row.id)
		return
	}
	if (row.kind === 'impulse') {
		const trackIds = sources.collapsedTrackIds
		sources.collapsedTrackIds = isFolded ? withId(trackIds, row.id) : withoutId(trackIds, row.id)
		return
	}
	const groupIds = automation.collapsedGroupIds
	automation.collapsedGroupIds = isFolded ? withId(groupIds, row.id) : withoutId(groupIds, row.id)
}

// ---- Height -------------------------------------------------

export const getRowDisplayHeight = (row: RowRefT): number => {
	const spec = ROW_SPECS[row.kind]
	const isFolded = checkIsRowFolded(row)
	if (isFolded) return spec.foldHeight
	return getRowHeight(row.id) ?? spec.defaultHeight
}

export const resolveRowHeight = (kind: RowKindT, rawHeight: number, wasFolded: boolean): RowResolutionT => {
	const spec = ROW_SPECS[kind]
	const foldLimit = wasFolded ? spec.unfoldAbove : spec.foldBelow
	const shouldFold = rawHeight < foldLimit
	if (shouldFold) return { isFolded: true, height: spec.foldHeight }
	const height = clamp(Math.round(rawHeight), spec.minHeight, MAX_ROW_HEIGHT)
	return { isFolded: false, height }
}

const storeRowHeight = (row: RowRefT, resolution: RowResolutionT): void => {
	setRowFolded(row, resolution.isFolded)
	if (resolution.isFolded) return
	const spec = ROW_SPECS[row.kind]
	const isDefault = resolution.height === spec.defaultHeight
	if (isDefault) return resetRowHeight(row.id)
	appearance.heights[row.id] = resolution.height
}

// Applies a dragged height to a row and, when the primary
// modifier is held, to every sibling the same way.
export const applyRowHeight = (row: RowRefT, rawHeight: number, siblings: RowRefT[]): void => {
	const wasFolded = checkIsRowFolded(row)
	const resolution = resolveRowHeight(row.kind, rawHeight, wasFolded)
	storeRowHeight(row, resolution)
	for (const sibling of siblings) storeRowHeight(sibling, resolution)
}

// Pinch on a header: a smooth change of height, one undo step
// for the whole gesture.
export const nudgeRowHeight = (row: RowRefT, deltaHeight: number, siblings: RowRefT[]): void => {
	recordHistoryCoalesced(`row-height:${row.id}`)
	const currentHeight = getRowDisplayHeight(row)
	applyRowHeight(row, currentHeight + deltaHeight, siblings)
}

export const resetRowLayout = (row: RowRefT): void => {
	recordHistory()
	setRowFolded(row, false)
	resetRowHeight(row.id)
}

// A caret click. With the primary modifier, siblings follow.
export const toggleRowFolded = (row: RowRefT, siblings: RowRefT[]): void => {
	recordHistory()
	const nextFolded = !checkIsRowFolded(row)
	setRowFolded(row, nextFolded)
	for (const sibling of siblings) setRowFolded(sibling, nextFolded)
}

export const getRowHeightCss = (row: RowRefT): string | undefined => {
	const isFolded = checkIsRowFolded(row)
	const isFoldedLayer = isFolded && row.kind === 'layer'
	if (isFoldedLayer) return `${ROW_SPECS.layer.foldHeight}px`
	if (isFolded) return `${ROW_SPECS[row.kind].foldHeight}px`
	const height = getRowHeight(row.id)
	if (height === null) return undefined
	return `${height}px`
}
