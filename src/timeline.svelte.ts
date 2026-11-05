import { clamp } from './engine/settings'
import { clampView, getViewEnd, panView, zoomView } from './engine/timeline'
import type { GridDivisionT, TimelineViewT } from './engine/timeline'
import { app } from './store.svelte'

type TimelineStateT = {
	view: TimelineViewT
	isFollowing: boolean
	isSnapping: boolean
	gridDivision: GridDivisionT
	isTriplet: boolean
	hoverTime: number | null
	dockHeight: number
	trackWidth: number
}

const DOCK_HEIGHT_KEY = 'vink.dockHeight'
const DEFAULT_DOCK_HEIGHT = 384
export const MIN_DOCK_HEIGHT = 216
export const MAX_DOCK_SHARE = 0.72
const ZOOM_STEP = 1.6
// Following pages ahead once the playhead passes this share of
// the view, so the line never runs off the right edge.
const FOLLOW_EDGE = 0.92
const FOLLOW_LEAD = 0.08

const readStoredDockHeight = (): number => {
	try {
		const stored = Number(localStorage.getItem(DOCK_HEIGHT_KEY))
		const isUsable = Number.isFinite(stored) && stored >= MIN_DOCK_HEIGHT
		return isUsable ? stored : DEFAULT_DOCK_HEIGHT
	} catch {
		return DEFAULT_DOCK_HEIGHT
	}
}

export const timeline = $state<TimelineStateT>({
	view: { start: 0, span: 1 },
	isFollowing: true,
	isSnapping: true,
	gridDivision: 'auto',
	isTriplet: false,
	hoverTime: null,
	dockHeight: readStoredDockHeight(),
	trackWidth: 0
})

const setView = (view: TimelineViewT): void => {
	timeline.view = clampView(view, app.duration)
}

export const fitView = (): void => {
	setView({ start: 0, span: app.duration })
}

export const checkIsFitted = (): boolean => {
	const isAtStart = timeline.view.start <= 0.001
	const isFullSpan = timeline.view.span >= app.duration - 0.001
	return isAtStart && isFullSpan
}

const getViewCenter = (): number => timeline.view.start + timeline.view.span / 2

// Keyboard and button zoom anchors on the playhead when it is
// on screen, like most editors, and on the center otherwise.
const getZoomAnchor = (): number => {
	const isPlayheadVisible = app.currentTime >= timeline.view.start && app.currentTime <= getViewEnd(timeline.view)
	return isPlayheadVisible ? app.currentTime : getViewCenter()
}

export const zoomAt = (factor: number, anchorTime: number): void => {
	timeline.view = zoomView(timeline.view, factor, anchorTime, app.duration)
}

export const zoomIn = (): void => zoomAt(1 / ZOOM_STEP, getZoomAnchor())

export const zoomOut = (): void => zoomAt(ZOOM_STEP, getZoomAnchor())

export const panBy = (deltaSeconds: number): void => {
	timeline.view = panView(timeline.view, deltaSeconds, app.duration)
}

export const setViewStart = (start: number): void => {
	setView({ start, span: timeline.view.span })
}

export const setViewRange = (start: number, end: number): void => {
	setView({ start, span: end - start })
}

export const getZoomLevel = (): number => {
	const hasSpan = timeline.view.span > 0
	if (!hasSpan) return 1
	return app.duration / timeline.view.span
}

export const toggleFollowing = (): void => {
	timeline.isFollowing = !timeline.isFollowing
}

export const toggleSnapping = (): void => {
	timeline.isSnapping = !timeline.isSnapping
}

export const setGridDivision = (division: GridDivisionT): void => {
	timeline.gridDivision = division
}

export const toggleTriplet = (): void => {
	timeline.isTriplet = !timeline.isTriplet
}

export const setHoverTime = (time: number | null): void => {
	timeline.hoverTime = time
}

export const setTrackWidth = (width: number): void => {
	timeline.trackWidth = width
}

export const setDockHeight = (height: number, maxHeight: number): void => {
	const upperBound = Math.max(MIN_DOCK_HEIGHT, maxHeight)
	timeline.dockHeight = clamp(height, MIN_DOCK_HEIGHT, upperBound)
	try {
		localStorage.setItem(DOCK_HEIGHT_KEY, String(Math.round(timeline.dockHeight)))
	} catch {
		return
	}
}

export const resetDockHeight = (maxHeight: number): void => {
	setDockHeight(DEFAULT_DOCK_HEIGHT, maxHeight)
}

// Pages the view so a moving playhead stays in sight.
export const followPlayhead = (time: number): void => {
	const view = timeline.view
	const followEdge = view.start + view.span * FOLLOW_EDGE
	const isPastEdge = time > followEdge
	const isBeforeStart = time < view.start
	const shouldPage = isPastEdge || isBeforeStart
	if (!shouldPage) return
	const nextStart = time - view.span * FOLLOW_LEAD
	setViewStart(nextStart)
}

export const revealTime = (time: number): void => {
	const isVisible = time >= timeline.view.start && time <= getViewEnd(timeline.view)
	if (isVisible) return
	setViewStart(time - timeline.view.span / 2)
}
