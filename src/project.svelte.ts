import { tick } from 'svelte'
import { automation } from './automation.svelte'
import { readSongFile } from './engine/assets'
import { GRID_DIVISIONS } from './engine/timeline'
import type { GridDivisionT, TimelineViewT } from './engine/timeline'
import type { InspectorTabT } from './inspector.svelte'
import { buildSongKey, sources } from './sources.svelte'
import { layerStore } from './layers.svelte'
import { addAudioFile, app, seekTo, setLoopEnabled, setLoopRegion, setStatus } from './store.svelte'
import { timeline } from './timeline.svelte'

// Everything about the open project that is not already saved
// by its own store: the song's place, tempo corrections, trim,
// the marker, and how the editor was laid out. Settings,
// layers, lanes, impulse tracks and bands save themselves. The song
// file is kept in IndexedDB.

type SavedProjectT = {
	songKey: string
	fileName: string
	title?: string
	projectName?: string
	isProjectNameEdited?: boolean
	bpm: number
	beatOffset: number
	downbeatAnchor: number | null
	trimStart: number
	trimEnd: number
	loopStart?: number
	loopEnd?: number
	isLoopEnabled?: boolean
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
	inspectorTab?: InspectorTabT
}

const STORAGE_KEY = 'vink.project.v1'

const buildSnapshot = (): SavedProjectT => ({
	songKey: buildSongKey(app.fileName, app.duration),
	fileName: app.fileName,
	projectName: app.projectName,
	isProjectNameEdited: app.isProjectNameEdited,
	bpm: app.bpm,
	beatOffset: app.beatOffset,
	downbeatAnchor: app.downbeatAnchor,
	trimStart: app.trimStart,
	trimEnd: app.trimEnd,
	loopStart: app.loopStart,
	loopEnd: app.loopEnd,
	isLoopEnabled: app.isLoopEnabled,
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
	inspectorTab: 'settings'
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

const applySongState = (project: SavedProjectT): void => {
	app.projectName = project.projectName ?? app.projectName
	app.isProjectNameEdited = project.isProjectNameEdited === true
	app.bpm = project.bpm
	app.beatOffset = project.beatOffset
	app.downbeatAnchor = project.downbeatAnchor
	app.trimStart = project.trimStart
	app.trimEnd = project.trimEnd
	const hasLoop = typeof project.loopStart === 'number' && typeof project.loopEnd === 'number'
	if (hasLoop) setLoopRegion(project.loopStart as number, project.loopEnd as number)
	setLoopEnabled(project.isLoopEnabled === true)
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
}

// The editor zooms to fit when a song arrives, so the saved
// view and marker go back once that has settled.
const applyViewState = async (project: SavedProjectT): Promise<void> => {
	await tick()
	await new Promise((resolve) => requestAnimationFrame(resolve))
	timeline.view = { start: project.view.start, span: project.view.span }
	seekTo(project.playMarker)
}

// Projects saved before audio became layers kept the song in a file
// of its own. It becomes the first audio layer.
const migrateLegacySong = async (project: SavedProjectT): Promise<void> => {
	const hasAudioLayer = layerStore.layers.some((layer) => layer.kind === 'audio')
	if (hasAudioLayer) return
	const file = await readSongFile(project.fileName).catch(() => null)
	if (file === null) return
	setStatus(`Restoring ${project.fileName}…`)
	await addAudioFile(file, { isRestore: true })
}

// Brings back the project's tempo, trim, loop and how the editor was
// laid out. The audio layers themselves were already restored. Quiet
// when there is nothing saved.
export const restoreProject = async (): Promise<void> => {
	const project = readSavedProject()
	if (project === null) return
	await migrateLegacySong(project)
	if (!app.hasSong || app.isAnalyzing) return
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
			if (!app.hasSong || app.isAnalyzing) return
			writeSavedProject(snapshot)
		})
	})
}

// Forgets the saved project, for when its song is removed.
export const clearSavedProject = (): void => {
	try {
		window.localStorage.removeItem(STORAGE_KEY)
	} catch {
		return
	}
}
