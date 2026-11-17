import { automation, clearCopiedPoints, getCopiedPoints } from './automation.svelte'
import { applyLayerAutomationOnly } from './engine/automation'
import { applyMappingsToLayers } from './engine/mappings'
import type { AutomationPointT, ImpulseTrackT, LayerT } from './engine/types'
import { clearLayerClipboards, getClipClipboard, getLayerClipboard } from './layerEdit.svelte'
import type { ClipClipboardEntryT, ClipboardEntryT } from './layerEdit.svelte'
import { layerStore } from './layers.svelte'
import { mappingsStore } from './mappings.svelte'
import { sources } from './sources.svelte'
import { stageView } from './stage.svelte'
import { app, getAudioLayerBuffer } from './store.svelte'
import { timeline } from './timeline.svelte'
import { uiState } from './uiState.svelte'

export type StateSectionKeyT =
	| 'all'
	| 'app'
	| 'layers'
	| 'liveLayers'
	| 'mappings'
	| 'sources'
	| 'automation'
	| 'timeline'
	| 'clipboard'

export type AudioLayerRuntimeSummaryT = {
	layerId: string
	name: string
	hasBuffer: boolean
	bufferDuration: number | null
	clipCount: number
}

export type ClipboardKindT = 'none' | 'layers' | 'clips' | 'automationPoints' | 'mixed'

export type ClipboardSnapshotT = {
	hasContent: boolean
	kind: ClipboardKindT
	counts: {
		layers: number
		clips: number
		automationPoints: number
	}
	layers: ClipboardEntryT[]
	clips: ClipClipboardEntryT[]
	automationPoints: AutomationPointT[]
}

export type AppStateSnapshotT = {
	timestamp: string
	app: {
		projectName: string
		fileName: string
		hasSong: boolean
		hasAudio: boolean
		isLayersReady: boolean
		isPlaying: boolean
		isLoopEnabled: boolean
		isMetronomeEnabled: boolean
		currentTime: number
		playMarker: number
		duration: number
		projectDuration: number
		bpm: number
		beatOffset: number
		downbeatAnchor: number | null
		trimStart: number
		trimEnd: number
		loopStart: number
		loopEnd: number
		settings: typeof app.settings
		audioLayersRuntime: AudioLayerRuntimeSummaryT[]
	}
	selection: {
		selectedLayerId: string | null
		selectedLayerIds: string[]
		selectedClip: typeof layerStore.selectedClip
		selectedClips: typeof layerStore.selectedClips
		selectedModulator: typeof mappingsStore.selectedModulator
		selectedPointLaneId: string | null
		selectedPointIds: string[]
		impulseSelection: typeof sources.impulseSelection
	}
	clipboard: ClipboardSnapshotT
	layers: LayerT[]
	liveLayers: LayerT[]
	mappings: typeof mappingsStore.list
	sources: {
		isTriggersCollapsed: boolean
		collapsedTrackIds: string[]
		bands: typeof sources.bands
		tracks: ImpulseTrackT[]
	}
	automation: {
		collapsedLaneIds: string[]
		collapsedGroupIds: string[]
		lanes: typeof automation.lanes
	}
	timeline: {
		view: typeof timeline.view
		isSnapping: boolean
		isFollowing: boolean
		gridDivision: typeof timeline.gridDivision
		isTriplet: boolean
		dockHeight: number
	}
	stage: {
		zoom: number
		panX: number
		panY: number
		isStageFocused: boolean
		isUiHidden: boolean
		isDockFolded: boolean
	}
}

export const clearAllClipboards = (): void => {
	clearLayerClipboards()
	clearCopiedPoints()
}

export const buildAppStateSnapshot = (): AppStateSnapshotT => {
	const rawLayers = layerStore.layers as LayerT[]
	const modContext = { tracks: sources.tracks, lanes: automation.lanes }
	const automatedLayers = applyLayerAutomationOnly(rawLayers, app.settings, automation.lanes, app.currentTime)
	const evaluatedLayers = applyMappingsToLayers(automatedLayers, mappingsStore.list, modContext, app.currentTime)

	const audioLayersRuntime: AudioLayerRuntimeSummaryT[] = rawLayers
		.filter((layer) => layer.kind === 'audio')
		.map((layer) => {
			const buffer = getAudioLayerBuffer(layer.id)
			return {
				layerId: layer.id,
				name: layer.name,
				hasBuffer: buffer !== null,
				bufferDuration: buffer?.duration ?? null,
				clipCount: layer.clips.length
			}
		})

	const layerClipboard = getLayerClipboard()
	const clipClipboard = getClipClipboard()
	const pointClipboard = getCopiedPoints()

	const hasLayers = layerClipboard.length > 0
	const hasClips = clipClipboard.length > 0
	const hasPoints = pointClipboard.length > 0
	const hasContent = hasLayers || hasClips || hasPoints

	let clipboardKind: ClipboardKindT = 'none'
	if (hasLayers && !hasClips && !hasPoints) clipboardKind = 'layers'
	else if (hasClips && !hasLayers && !hasPoints) clipboardKind = 'clips'
	else if (hasPoints && !hasLayers && !hasClips) clipboardKind = 'automationPoints'
	else if (hasContent) clipboardKind = 'mixed'

	const clipboard: ClipboardSnapshotT = {
		hasContent,
		kind: clipboardKind,
		counts: {
			layers: layerClipboard.length,
			clips: clipClipboard.length,
			automationPoints: pointClipboard.length
		},
		layers: $state.snapshot(layerClipboard) as ClipboardEntryT[],
		clips: $state.snapshot(clipClipboard) as ClipClipboardEntryT[],
		automationPoints: $state.snapshot(pointClipboard) as AutomationPointT[]
	}

	return {
		timestamp: new Date().toISOString(),
		app: {
			projectName: app.projectName,
			fileName: app.fileName,
			hasSong: app.hasSong,
			hasAudio: app.hasAudio,
			isLayersReady: app.isLayersReady,
			isPlaying: app.isPlaying,
			isLoopEnabled: app.isLoopEnabled,
			isMetronomeEnabled: app.isMetronomeEnabled,
			currentTime: Number(app.currentTime.toFixed(4)),
			playMarker: Number(app.playMarker.toFixed(4)),
			duration: Number(app.duration.toFixed(4)),
			projectDuration: app.projectDuration,
			bpm: app.bpm,
			beatOffset: Number(app.beatOffset.toFixed(4)),
			downbeatAnchor: app.downbeatAnchor,
			trimStart: Number(app.trimStart.toFixed(4)),
			trimEnd: Number(app.trimEnd.toFixed(4)),
			loopStart: Number(app.loopStart.toFixed(4)),
			loopEnd: Number(app.loopEnd.toFixed(4)),
			settings: $state.snapshot(app.settings),
			audioLayersRuntime
		},
		selection: {
			selectedLayerId: layerStore.selectedLayerId,
			selectedLayerIds: [...layerStore.selectedLayerIds],
			selectedClip: layerStore.selectedClip === null ? null : { ...layerStore.selectedClip },
			selectedClips: $state.snapshot(layerStore.selectedClips),
			selectedModulator: mappingsStore.selectedModulator === null ? null : { ...mappingsStore.selectedModulator },
			selectedPointLaneId: automation.selectedPointLaneId,
			selectedPointIds: [...automation.selectedPointIds],
			impulseSelection: $state.snapshot(sources.impulseSelection)
		},
		clipboard,
		layers: $state.snapshot(rawLayers),
		liveLayers: $state.snapshot(evaluatedLayers),
		mappings: $state.snapshot(mappingsStore.list),
		sources: {
			isTriggersCollapsed: sources.isTriggersCollapsed,
			collapsedTrackIds: [...sources.collapsedTrackIds],
			bands: $state.snapshot(sources.bands),
			tracks: $state.snapshot(sources.tracks)
		},
		automation: {
			collapsedLaneIds: [...automation.collapsedLaneIds],
			collapsedGroupIds: [...automation.collapsedGroupIds],
			lanes: $state.snapshot(automation.lanes)
		},
		timeline: {
			view: { ...timeline.view },
			isSnapping: timeline.isSnapping,
			isFollowing: timeline.isFollowing,
			gridDivision: timeline.gridDivision,
			isTriplet: timeline.isTriplet,
			dockHeight: timeline.dockHeight
		},
		stage: {
			zoom: Number(stageView.zoom.toFixed(4)),
			panX: Math.round(stageView.panX),
			panY: Math.round(stageView.panY),
			isStageFocused: uiState.isStageFocused,
			isUiHidden: uiState.isUiHidden,
			isDockFolded: uiState.isDockFolded
		}
	}
}

export const selectStateSection = (snapshot: AppStateSnapshotT, section: StateSectionKeyT): unknown => {
	if (section === 'app') return { app: snapshot.app, selection: snapshot.selection, stage: snapshot.stage }
	if (section === 'layers') return { selection: snapshot.selection, layers: snapshot.layers }
	if (section === 'liveLayers') return { currentTime: snapshot.app.currentTime, liveLayers: snapshot.liveLayers }
	if (section === 'mappings') return { selectedModulator: snapshot.selection.selectedModulator, mappings: snapshot.mappings }
	if (section === 'sources') return snapshot.sources
	if (section === 'automation') return snapshot.automation
	if (section === 'timeline') return snapshot.timeline
	if (section === 'clipboard') return snapshot.clipboard
	return snapshot
}

export const installGlobalStateInspector = (): void => {
	if (typeof window === 'undefined') return
	const globalTarget = window as unknown as Record<string, unknown>
	globalTarget.__visualist = {
		getState: buildAppStateSnapshot,
		clearClipboard: clearAllClipboards,
		stores: {
			app,
			layerStore,
			mappingsStore,
			sources,
			automation,
			timeline,
			stageView,
			uiState
		}
	}
}
