import { tick } from 'svelte'
import { automation } from './automation.svelte'
import { readSongFile } from './engine/assets'
import { GRID_DIVISIONS } from './engine/timeline'
import type { GridDivisionT, TimelineViewT } from './engine/timeline'
import { inspector } from './inspector.svelte'
import type { InspectorTabT } from './inspector.svelte'
import { buildSongKey, sources } from './sources.svelte'
import { app, loadAudioFile, seekTo, setStatus } from './store.svelte'
import { timeline } from './timeline.svelte'

// Everything about the open project that is not already saved
// by its own store: the song's place, tempo corrections, trim,
// the marker, and how the editor was laid out. Settings,
// layers, lanes, hit tracks and bands save themselves. The song
// file is kept in IndexedDB.

type SavedProjectT = {
	songKey: string
	fileName: string
	title: string
	isTitleEdited: boolean
	musicalKey: string
	musicalScale: string
	bpm: number
	beatOffset: number
	downbeatAnchor: number | null
	trimStart: number
	trimEnd: number
	playMarker: number
	view: TimelineViewT
	isSnapping: boolean
	isFollowing: boolean
	gridDivision: GridDivisionT
	isTriplet: boolean
	collapsedLaneIds: string[]
	collapsedGroupIds: string[]
	collapsedTrackIds: string[]
	isTriggersCollapsed: boolean
	inspectorTab: InspectorTabT
}

const STORAGE_KEY = 'vink.project.v1'
const INSPECTOR_TABS: InspectorTabT[] = ['settings', 'sources', 'layers', 'post', 'export']

const buildSnapshot = (): SavedProjectT => ({
	songKey: sources.songKey,
	fileName: app.fileName,
	title: app.title,
	isTitleEdited: app.isTitleEdited,
	musicalKey: app.musicalKey,
	musicalScale: app.musicalScale,
	bpm: app.bpm,
	beatOffset: app.beatOffset,
	downbeatAnchor: app.downbeatAnchor,
	trimStart: app.trimStart,
	trimEnd: app.trimEnd,
	playMarker: app.playMarker,
	view: { start: timeline.view.start, span: timeline.view.span },
	isSnapping: timeline.isSnapping,
	isFollowing: timeline.isFollowing,
	gridDivision: timeline.gridDivision,
	isTriplet: timeline.isTriplet,
	collapsedLaneIds: [...automation.collapsedLaneIds],
	collapsedGroupIds: [...automation.collapsedGroupIds],
	collapsedTrackIds: [...sources.collapsedTrackIds],
	isTriggersCollapsed: sources.isTriggersCollapsed,
	inspectorTab: inspector.activeTab
})

const checkIsSavedShape = (value: unknown): value is SavedProjectT => {
	const isObject = typeof value === 'object' && value !== null
	if (!isObject) return false
	const candidate = value as Partial<SavedProjectT>
	const hasSong = typeof candidate.songKey === 'string' && typeof candidate.fileName === 'string'
	const hasTempo = typeof candidate.bpm === 'number' && typeof candidate.beatOffset === 'number'
	return hasSong && hasTempo
}

const readSavedProject = (): SavedProjectT | null => {
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY)
		if (stored === null) return null
		const parsed: unknown = JSON.parse(stored)
		if (!checkIsSavedShape(parsed)) return null
		return parsed
	} catch {
		return null
	}
}

const writeSavedProject = (project: SavedProjectT): void => {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
	} catch {
		return
	}
}

const pickGridDivision = (value: unknown): GridDivisionT => {
	const isKnown = GRID_DIVISIONS.includes(value as GridDivisionT)
	if (isKnown) return value as GridDivisionT
	return 'auto'
}

const pickInspectorTab = (value: unknown): InspectorTabT => {
	const isKnown = INSPECTOR_TABS.includes(value as InspectorTabT)
	if (isKnown) return value as InspectorTabT
	return 'settings'
}

const applySongState = (project: SavedProjectT): void => {
	app.title = project.title
	app.isTitleEdited = project.isTitleEdited
	app.musicalKey = project.musicalKey
	app.musicalScale = project.musicalScale
	app.bpm = project.bpm
	app.beatOffset = project.beatOffset
	app.downbeatAnchor = project.downbeatAnchor
	app.trimStart = project.trimStart
	app.trimEnd = project.trimEnd
}

const applyEditorState = (project: SavedProjectT): void => {
	timeline.isSnapping = project.isSnapping
	timeline.isFollowing = project.isFollowing
	timeline.gridDivision = pickGridDivision(project.gridDivision)
	timeline.isTriplet = project.isTriplet === true
	automation.collapsedLaneIds = project.collapsedLaneIds ?? []
	automation.collapsedGroupIds = project.collapsedGroupIds ?? []
	sources.collapsedTrackIds = project.collapsedTrackIds ?? []
	sources.isTriggersCollapsed = project.isTriggersCollapsed === true
	inspector.activeTab = pickInspectorTab(project.inspectorTab)
}

// The editor zooms to fit when a song arrives, so the saved
// view and marker go back once that has settled.
const applyViewState = async (project: SavedProjectT): Promise<void> => {
	await tick()
	await new Promise((resolve) => requestAnimationFrame(resolve))
	timeline.view = { start: project.view.start, span: project.view.span }
	seekTo(project.playMarker)
}

// Brings back the last song and everything around it. Quiet
// when there is nothing saved.
export const restoreProject = async (): Promise<void> => {
	const project = readSavedProject()
	if (project === null) return
	const file = await readSongFile(project.fileName).catch(() => null)
	if (file === null) return
	setStatus(`Restoring ${project.fileName}…`)
	const hasLoaded = await loadAudioFile(file, { isRestore: true })
	if (!hasLoaded) return
	const songKey = buildSongKey(file.name, app.duration)
	const isSameSong = songKey === project.songKey
	if (!isSameSong) return
	applySongState(project)
	applyEditorState(project)
	await applyViewState(project)
}

// Saves on every change while a song is open. The demo is
// never saved over a real project.
export const startProjectWatchers = (): void => {
	$effect.root(() => {
		$effect(() => {
			const snapshot = buildSnapshot()
			if (!app.hasAudio || app.isAnalyzing) return
			writeSavedProject(snapshot)
		})
	})
}
