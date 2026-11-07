import { toaster } from '@tasteee/zest'
import { untrack } from 'svelte'
import { analyzeAudio, computeBeatOffset, placeAnalysis } from './engine/analysis'
import type { ClipPlacementT } from './engine/analysis'
import {
	createRecordingTap,
	getAudioContext,
	decodeAudioFile,
	getPlaybackTime,
	pausePlayback,
	retargetLoop,
	setActiveLoop,
	setExtraTracks,
	setExtraVolumes,
	startExtras,
	setPausedPosition,
	startPlayback
} from './engine/audio'
import { automation, recordHistory, startAutomationWatchers } from './automation.svelte'
import { applyAutomation, applyLayerAutomation } from './engine/automation'
import { applySettingsModulation, computeSignals } from './engine/modulation'
import { checkHasPost, getPostAmounts } from './engine/post'
import { startAppearanceWatchers } from './appearance.svelte'
import { findLayer, layerStore, restoreLayerAssets, selectLayer, startLayerWatchers } from './layers.svelte'
import { buildEnginePalette } from './palette.svelte'
import { createAudioLayer } from './engine/layers'
import { getCompiledSources, getRoleImpulses, startSourceWatchers } from './sources.svelte'
import type { RoleImpulsesT } from './sources.svelte'
import { buildDemoAnalysis } from './engine/demo'
import { buildLogoLayers } from './engine/logoLayers'
import type { LogoLayersT } from './engine/logoLayers'
import { startRecorder, pickRecorderFormat } from './engine/recorder'
import type { ActiveRecordingT, RecorderFormatT } from './engine/recorder'
import { drawFrame } from './engine/render'
import { checkNeedsDepth } from './engine/depth'
import { readLayerFile, storeLayerFile } from './engine/assets'
import { beginVideoPass, endVideoPass, getVideoDuration, setVideoFrameListener } from './engine/video'
import { getFadeLevel } from './engine/fades'
import { getSizeForShortSide } from './engine/formats'
import type { SizeT } from './engine/formats'
import type { LoopRegionT } from './engine/audio'
import {
	DEMO_LOOP_SECONDS,
	MIN_CLIP_SECONDS,
	TAIL_SECONDS,
	clamp,
	loadSettings,
	saveSettings
} from './engine/settings'
import type { AnalysisT, FrameInputT, LayerT, ModeT, PaletteT, SettingsT, SignalsT } from './engine/types'

export type StatusToneT = 'neutral' | 'success' | 'warning' | 'danger'

type AppStateT = {
	settings: SettingsT
	// What the project is called. Used for saving and for the file name
	// of an export. It never appears in the picture.
	projectName: string
	isProjectNameEdited: boolean
	// The tempo everything follows. Starts as detected, and the
	// user can correct both.
	bpm: number
	beatOffset: number
	// Set when the user picks the downbeat by hand, so a later
	// tempo change keeps that bar line where they put it.
	downbeatAnchor: number | null
	// The audio layer the picture listens to, and its name. It is the
	// first audio added. Every audio layer is mixed in and heard.
	songLayerId: string | null
	fileName: string
	// hasAudio: there is a timeline to play. hasSong: some audio layer
	// drives the picture. A new project has a silent timeline.
	hasAudio: boolean
	hasSong: boolean
	duration: number
	trimStart: number
	trimEnd: number
	// The loop is its own region. While it is on, it is the only
	// legal range for the playhead.
	loopStart: number
	loopEnd: number
	isLoopEnabled: boolean
	// A tempo found in a song, waiting for the user to say whether
	// the project should take it.
	pendingBpm: number | null
	kickCount: number
	isAnalyzing: boolean
	analysisProgress: number
	isLayersReady: boolean
	isPlaying: boolean
	isRecording: boolean
	currentTime: number
	// Where the user last put the playhead. Play starts here and
	// stop comes back here, so a tweak can be heard again fast.
	playMarker: number
	recordProgress: number
	statusText: string
	statusTone: StatusToneT
	isDraggingFile: boolean
	recorderLabel: string
}

const DEFAULT_PROJECT_SECONDS = 60
const MIN_PROJECT_SECONDS = 1
// The lowest rate Web Audio accepts. The base is silent, so quality
// does not matter, only length.
const SILENT_SAMPLE_RATE = 8000
// Dragging a clip moves its analysis only once it settles.
const PLACEMENT_DELAY = 120
const PALETTE_DELAY = 120
// The live preview draws smaller than the export, so heavy
// effects stay smooth. Recording always uses the export size.
const PREVIEW_SHORT_SIDE = 810
const DEMO_STATUS = 'Previewing the built-in demo beat. Drop a song to begin.'

export const app = $state<AppStateT>({
	settings: loadSettings(),
	projectName: 'Untitled project',
	isProjectNameEdited: false,
	bpm: 120,
	beatOffset: 0,
	downbeatAnchor: null,
	songLayerId: null,
	fileName: '',
	hasAudio: false,
	hasSong: false,
	duration: 0,
	trimStart: 0,
	trimEnd: 0,
	loopStart: 0,
	loopEnd: 0,
	isLoopEnabled: false,
	pendingBpm: null,
	kickCount: 0,
	isAnalyzing: false,
	analysisProgress: 0,
	isLayersReady: false,
	isPlaying: false,
	isRecording: false,
	currentTime: 0,
	playMarker: 0,
	recordProgress: 0,
	statusText: DEMO_STATUS,
	statusTone: 'neutral',
	isDraggingFile: false,
	recorderLabel: ''
})

// Big typed arrays stay out of the deep proxy.
type SongSourceT = {
	layerId: string
	analysis: AnalysisT
}

const demoAnalysis = buildDemoAnalysis()
let songSource = $state.raw<SongSourceT | null>(null)
let songPlacement = $state.raw<ClipPlacementT | null>(null)

// What the audio analysis found, as it sits on the timeline, before
// any user corrections. Without audio it is the demo beat.
const buildDetectedAnalysis = (source: SongSourceT | null, placement: ClipPlacementT | null, duration: number): AnalysisT => {
	if (source === null || placement === null) return demoAnalysis
	return placeAnalysis(source.analysis, placement, duration)
}

const detectedAnalysis = $derived(buildDetectedAnalysis(songSource, songPlacement, app.duration))
let appliedPalette = $state.raw<PaletteT>(readPalette(app.settings))

let audioBuffer: AudioBuffer | null = null
let layers: LogoLayersT | null = null
let canvasElement: HTMLCanvasElement | null = null
let canvasContext: CanvasRenderingContext2D | null = null
let animationFrame = 0
let isDirty = true
let demoStartedAt = performance.now()
let lastTickTime = 0
let activeRecording: ActiveRecordingT | null = null
let recorderFormat: RecorderFormatT | null = null

function readPalette(settings: SettingsT): PaletteT {
	return buildEnginePalette(settings.background)
}

export const getDetectedAnalysis = (): AnalysisT => detectedAnalysis

// The analysis everything renders from: the user's tempo and
// downbeat, and any impulse tracks standing in for kicks or snares.
const buildEffectiveAnalysis = (detected: AnalysisT, bpm: number, beatOffset: number, roleImpulses: RoleImpulsesT): AnalysisT => ({
	...detected,
	bpm,
	beatOffset,
	kicks: roleImpulses.kicks ?? detected.kicks,
	snaps: roleImpulses.snaps ?? detected.snaps
})

const effectiveAnalysis = $derived(buildEffectiveAnalysis(detectedAnalysis, app.bpm, app.beatOffset, getRoleImpulses()))

export const getAnalysis = (): AnalysisT => effectiveAnalysis
export const getLogoLayers = (): LogoLayersT | null => layers

export const setStatus = (text: string, tone: StatusToneT = 'neutral'): void => {
	app.statusText = text
	app.statusTone = tone
}

export const formatTime = (seconds: number): string => {
	const safeSeconds = Math.max(0, seconds)
	const minutes = Math.floor(safeSeconds / 60)
	const wholeSeconds = Math.floor(safeSeconds % 60)
	const paddedSeconds = String(wholeSeconds).padStart(2, '0')
	return `${minutes}:${paddedSeconds}`
}

export const getOutputSize = (): SizeT => {
	const shortSide = Number(app.settings.resolution)
	return getSizeForShortSide(app.settings.aspectRatio, shortSide)
}

export const getCanvasSize = (): SizeT => {
	if (app.isRecording) return getOutputSize()
	return getSizeForShortSide(app.settings.aspectRatio, PREVIEW_SHORT_SIDE)
}

const getFrameTime = (): number => {
	if (app.hasAudio) return getPlaybackTime()
	const elapsed = (performance.now() - demoStartedAt) / 1000
	return elapsed % DEMO_LOOP_SECONDS
}

// Audio layers make sound, not picture, so the renderer never
// sees them.
const getVisualLayers = (): LayerT[] => (layerStore.layers as LayerT[]).filter((layer) => layer.kind !== 'audio')

// Lanes set each control's base for this instant, then the
// modulations push it around with the music.
const buildFrameInput = (time: number): FrameInputT => {
	const analysis = getAnalysis()
	const signals = computeSignals(analysis, time, getCompiledSources())
	const automatedSettings = applyAutomation(app.settings, automation.lanes, time)
	const settings = applySettingsModulation(automatedSettings, signals)

	return {
		time,
		analysis,
		settings,
		palette: appliedPalette,
		bpm: analysis.bpm,
		beatOffset: analysis.beatOffset,
		isIntroActive: app.isPlaying || app.isRecording,
		layers: applyLayerAutomation(getVisualLayers(), app.settings, automation.lanes, time),
		signals
	}
}

// The live mod sources at the playhead, for meters in the UI.
export const getLiveSignals = (): SignalsT => computeSignals(getAnalysis(), app.currentTime, getCompiledSources())

// The 3D stage (and three.js with it) loads the first time a
// project uses depth, moves the camera, or turns on Lens or Film.
// Until it is ready, and on devices without WebGL 2, frames are
// drawn flat.
type StageModuleT = typeof import('./engine/scene3d')
let stageModule: StageModuleT | null = null
let isStageRequested = false

const requestStage = (): void => {
	if (isStageRequested) return
	isStageRequested = true
	import('./engine/scene3d')
		.then((module) => {
			stageModule = module
			markDirty()
		})
		.catch(() => {
			setStatus('The 3D stage failed to load. Depth, camera, Lens and Film are off.', 'warning')
		})
}

const checkNeedsStage = (input: FrameInputT): boolean => {
	const hasPost = checkHasPost(getPostAmounts(input.settings))
	return hasPost || checkNeedsDepth(input)
}

const drawStageFrame = (context: CanvasRenderingContext2D, input: FrameInputT, logoLayers: LogoLayersT, width: number, height: number, time: number): boolean => {
	requestStage()
	if (stageModule === null) return false
	return stageModule.drawStageFrame(context, input, logoLayers, width, height, time)
}

const renderFrame = (context: CanvasRenderingContext2D, time: number, logoLayers: LogoLayersT, width: number, height: number): void => {
	const input = buildFrameInput(time)
	const needsStage = checkNeedsStage(input)
	const didDrawStage = needsStage && drawStageFrame(context, input, logoLayers, width, height, time)
	if (!didDrawStage) drawFrame(context, input, logoLayers, width, height)
}

const titleFromFileName = (fileName: string): string => {
	const withoutExtension = fileName.replace(/\.[^.]+$/, '')
	const spaced = withoutExtension.replace(/[_-]+/g, ' ')
	return spaced.replace(/\s+/g, ' ').trim().slice(0, 80)
}

const getBaseName = (fileName: string): string => fileName.replace(/\.[^.]+$/, '')

const getExportBaseName = (): string => {
	const name = app.projectName.trim()
	const isNamed = name.length > 0
	return isNamed ? name : 'project'
}

const downloadBlob = (blob: Blob, fileName: string): void => {
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = fileName
	document.body.appendChild(link)
	link.click()
	link.remove()
	setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const formatBytes = (bytes: number): string => {
	const megabytes = bytes / (1024 * 1024)
	return `${megabytes.toFixed(1)} MB`
}

export const markDirty = (): void => {
	isDirty = true
}

export const getClipLength = (): number => app.trimEnd - app.trimStart

const getRecordingLength = (): number => getClipLength() + TAIL_SECONDS

const drawVideoFade = (context: CanvasRenderingContext2D, width: number, height: number, elapsed: number): void => {
	const fadeIn = app.settings.videoFadeIn
	const fadeOut = app.settings.videoFadeOut
	const hasFade = fadeIn > 0 || fadeOut > 0
	if (!hasFade) return
	const level = getFadeLevel(elapsed, getRecordingLength(), fadeIn, fadeOut)
	const coverAlpha = 1 - level
	if (coverAlpha <= 0) return
	// The cover is sized in canvas pixels, not scene units.
	context.setTransform(1, 0, 0, 1, 0, 0)
	context.globalAlpha = coverAlpha
	context.fillStyle = appliedPalette.background
	context.fillRect(0, 0, width, height)
	context.globalAlpha = 1
}

export const setTrimStart = (seconds: number): void => {
	if (app.isRecording) return
	const latest = app.trimEnd - MIN_CLIP_SECONDS
	app.trimStart = clamp(seconds, 0, Math.max(0, latest))
}

export const setTrimEnd = (seconds: number): void => {
	if (app.isRecording) return
	const earliest = Math.min(app.duration, app.trimStart + MIN_CLIP_SECONDS)
	app.trimEnd = clamp(seconds, earliest, app.duration)
}

const finishRecording = async (): Promise<void> => {
	const recording = activeRecording
	if (recording === null) return
	activeRecording = null
	const format = recorderFormat
	pausePlayback()
	const blob = await recording.finish()
	const extension = format === null ? 'webm' : format.extension
	const fileName = `${getExportBaseName()}-visualizer.${extension}`
	downloadBlob(blob, fileName)

	app.isRecording = false
	app.isPlaying = false
	app.recordProgress = 0
	setPausedPosition(app.trimStart)
	app.currentTime = app.trimStart
	markDirty()

	const summary = `Saved ${fileName} · ${formatBytes(blob.size)}`
	setStatus(summary, 'success')
	toaster.show({ title: 'Video saved', description: summary, tone: 'success' })
}

export const cancelRecording = (): void => {
	const recording = activeRecording
	if (recording === null) return
	activeRecording = null
	recording.cancel()
	pausePlayback()
	setPausedPosition(app.trimStart)
	app.isRecording = false
	app.isPlaying = false
	app.recordProgress = 0
	app.currentTime = app.trimStart
	markDirty()
	setStatus('Recording cancelled. Nothing was saved.', 'warning')
}

const tick = (): void => {
	animationFrame = requestAnimationFrame(tick)
	const canvas = canvasElement
	const context = canvasContext
	const currentLayers = layers
	if (canvas === null || context === null || currentLayers === null) return

	const size = getCanvasSize()
	const hasWrongSize = canvas.width !== size.width || canvas.height !== size.height
	if (hasWrongSize) {
		canvas.width = size.width
		canvas.height = size.height
		isDirty = true
	}

	const time = getFrameTime()
	const isAnimating = app.isPlaying || app.isRecording || !app.hasAudio
	const shouldDraw = isDirty || isAnimating
	if (shouldDraw) beginVideoPass()
	if (shouldDraw) renderFrame(context, time, currentLayers, size.width, size.height)
	if (shouldDraw) endVideoPass()
	const recordingElapsed = time - app.trimStart
	if (shouldDraw && app.isRecording) drawVideoFade(context, size.width, size.height, recordingElapsed)
	isDirty = false

	if (app.isPlaying && extraLayerIds.length > 0) followVolumeAutomation(time)
	const hasWrapped = app.isPlaying && !app.isRecording && app.isLoopEnabled && time < lastTickTime - 0.05
	if (hasWrapped) {
		syncExtraTracks()
		startExtras(time)
	}
	lastTickTime = time

	const visibleTime = app.hasAudio ? Math.min(time, app.duration) : time
	const hasTimeChanged = visibleTime !== app.currentTime
	if (hasTimeChanged) app.currentTime = visibleTime

	if (!app.isRecording) return
	app.recordProgress = clamp(recordingElapsed / getRecordingLength(), 0, 1)
	const isRecordingDone = recordingElapsed >= getRecordingLength()
	if (isRecordingDone) void finishRecording()
}

export const attachCanvas = (canvas: HTMLCanvasElement): (() => void) => {
	canvasElement = canvas
	canvasContext = canvas.getContext('2d')
	isDirty = true
	animationFrame = requestAnimationFrame(tick)
	return () => {
		cancelAnimationFrame(animationFrame)
		canvasElement = null
		canvasContext = null
	}
}

const returnToMarker = (): void => {
	setPausedPosition(app.playMarker)
	app.currentTime = app.playMarker
	markDirty()
}

const handleEnded = (): void => {
	if (app.isRecording) return
	app.isPlaying = false
	returnToMarker()
}

// ---- Extra audio layers -------------------------------------

// Decoded audio for every audio layer. Kept after a layer is
// deleted so undo can bring it back.
const audioLayerBuffers = new Map<string, AudioBuffer>()

// Bumps when a decoded file arrives, so the project length and the
// mix are worked out again.
let audioVersion = $state(0)

export const getAudioLayerBuffer = (layerId: string): AudioBuffer | undefined => audioLayerBuffers.get(layerId)

// A duplicate shares its original's decoded audio.
export const shareAudioLayerBuffer = (fromLayerId: string, toLayerId: string): void => {
	const buffer = audioLayerBuffers.get(fromLayerId)
	if (buffer !== undefined) audioLayerBuffers.set(toLayerId, buffer)
}

// A coarse picture of a buffer for drawing: the loudest sample in
// each slice. Built once per buffer.
export type BufferPeaksT = {
	values: Float32Array
	perSecond: number
}

const PEAKS_PER_SECOND = 100
const peaksByBuffer = new WeakMap<AudioBuffer, BufferPeaksT>()

export const getAudioLayerPeaks = (layerId: string): BufferPeaksT | undefined => {
	const buffer = audioLayerBuffers.get(layerId)
	if (buffer === undefined) return undefined
	const cached = peaksByBuffer.get(buffer)
	if (cached !== undefined) return cached
	const samples = buffer.getChannelData(0)
	const sliceLength = Math.max(1, Math.floor(buffer.sampleRate / PEAKS_PER_SECOND))
	const values = new Float32Array(Math.ceil(samples.length / sliceLength))
	for (let index = 0; index < values.length; index++) {
		const start = index * sliceLength
		const end = Math.min(samples.length, start + sliceLength)
		let peak = 0
		for (let sample = start; sample < end; sample++) peak = Math.max(peak, Math.abs(samples[sample]))
		values[index] = peak
	}
	const peaks = { values, perSecond: buffer.sampleRate / sliceLength }
	peaksByBuffer.set(buffer, peaks)
	return peaks
}

// A hidden audio layer is muted.
let extraLayerIds: string[] = []

const syncExtraTracks = (): void => {
	const tracks = []
	extraLayerIds = []
	for (const layer of layerStore.layers) {
		const isAudio = layer.kind === 'audio'
		const buffer = isAudio ? audioLayerBuffers.get(layer.id) : undefined
		if (!isAudio || buffer === undefined || !layer.isVisible) continue
		extraLayerIds.push(layer.id)
		tracks.push({ buffer, startTime: layer.startTime, endTime: layer.endTime, volume: layer.transform.volume, offset: layer.sourceOffset })
	}
	setExtraTracks(tracks)
}

// ---- Loop ---------------------------------------------------

const BARS_IN_DEFAULT_LOOP = 4

const getLoopRegion = (): LoopRegionT | null => {
	if (!app.isLoopEnabled) return null
	return { start: app.loopStart, end: app.loopEnd }
}

// With loop on, a time before the region lands on its start and
// a time after it lands on its end.
export const clampToLoop = (seconds: number): number => {
	if (!app.isLoopEnabled) return seconds
	return clamp(seconds, app.loopStart, app.loopEnd)
}

// The playhead is inside the region again, and the audio loops
// over it. Called whenever the region or its switch changes.
const applyLoopToTransport = (): void => {
	const canApply = app.hasAudio && audioBuffer !== null && !app.isRecording
	if (!canApply || audioBuffer === null) return
	const region = getLoopRegion()
	const liveTime = app.isPlaying ? getPlaybackTime() : app.currentTime
	const clampedTime = clampToLoop(liveTime)
	const clampedMarker = clampToLoop(app.playMarker)
	app.playMarker = clampedMarker
	app.currentTime = clampedTime
	markDirty()
	const isInsideRegion = clampedTime === liveTime
	const canRetarget = app.isPlaying && isInsideRegion
	if (canRetarget) {
		retargetLoop(region)
		return
	}
	setActiveLoop(region)
	syncExtraTracks()
	if (app.isPlaying) startPlayback(audioBuffer, clampedTime, null, handleEnded)
	if (!app.isPlaying) setPausedPosition(clampedMarker)
}

export const setLoopRegion = (start: number, end: number): void => {
	if (app.isRecording) return
	const length = Math.max(MIN_CLIP_SECONDS, end - start)
	const safeStart = clamp(start, 0, Math.max(0, app.duration - length))
	const safeEnd = Math.min(app.duration, safeStart + length)
	app.loopStart = safeStart
	app.loopEnd = safeEnd
	applyLoopToTransport()
}

export const setLoopEnabled = (isEnabled: boolean): void => {
	if (app.isRecording) return
	app.isLoopEnabled = isEnabled
	applyLoopToTransport()
}

export const toggleLoop = (): void => setLoopEnabled(!app.isLoopEnabled)

const resetLoopRegion = (): void => {
	const barLength = getBarLength(app.bpm)
	const defaultEnd = Math.min(app.duration, barLength * BARS_IN_DEFAULT_LOOP)
	app.loopStart = 0
	app.loopEnd = Math.max(MIN_CLIP_SECONDS, defaultEnd)
}

// Stop goes back to the marker instead of pausing in place.
export const togglePlay = (): void => {
	const canPlay = app.hasAudio && audioBuffer !== null && !app.isRecording
	if (!canPlay || audioBuffer === null) return

	if (app.isPlaying) {
		pausePlayback()
		app.isPlaying = false
		returnToMarker()
		return
	}

	// Starting from the loop's end wraps first, so transport
	// never sits on an empty instant.
	const isAtLoopEnd = app.isLoopEnabled && app.playMarker >= app.loopEnd - 0.001
	const startTime = isAtLoopEnd ? app.loopStart : clampToLoop(app.playMarker)
	app.playMarker = startTime
	app.currentTime = startTime
	setActiveLoop(getLoopRegion())
	syncExtraTracks()
	startPlayback(audioBuffer, startTime, null, handleEnded)
	app.isPlaying = true
}

// Every seek is the user placing the playhead, so it moves the
// marker too.
export const seekTo = (seconds: number): void => {
	const canSeek = app.hasAudio && audioBuffer !== null && !app.isRecording
	if (!canSeek || audioBuffer === null) return

	const songTarget = clamp(seconds, 0, Math.max(0, app.duration - 0.01))
	const target = clampToLoop(songTarget)
	app.currentTime = target
	app.playMarker = target
	markDirty()
	const isOnLoopEnd = app.isLoopEnabled && target >= app.loopEnd - 0.001
	if (app.isPlaying && isOnLoopEnd) return seekTo(app.loopStart)
	if (app.isPlaying) {
		syncExtraTracks()
		startPlayback(audioBuffer, target, null, handleEnded)
	}
	if (!app.isPlaying) setPausedPosition(target)
}

export const goToBeginning = (): void => seekTo(0)

const buildSilentBuffer = (seconds: number): AudioBuffer => {
	const sampleCount = Math.max(1, Math.round(SILENT_SAMPLE_RATE * seconds))
	return getAudioContext().createBuffer(1, sampleCount, SILENT_SAMPLE_RATE)
}

// A project with no audio plays a silent timeline, so layers, lanes and
// impulses can be made before any audio is chosen. Audio layers are
// mixed over this silent base, which only keeps the clock and the length.
const useSilentBase = (): void => {
	pausePlayback()
	setActiveLoop(null)
	audioBuffer = buildSilentBuffer(DEFAULT_PROJECT_SECONDS)
	songSource = null
	songPlacement = null
	app.hasAudio = true
	app.hasSong = false
	app.songLayerId = null
	app.isPlaying = false
	app.duration = DEFAULT_PROJECT_SECONDS
	app.trimStart = 0
	app.trimEnd = DEFAULT_PROJECT_SECONDS
	app.currentTime = 0
	app.playMarker = 0
	app.fileName = ''
	app.isLoopEnabled = false
	app.pendingBpm = null
	setPausedPosition(0)
	resetLoopRegion()
	setStatus(DEMO_STATUS)
	markDirty()
}

// ---- Project length -------------------------------------------

// The project runs as long as its audio and video. With neither, it
// is a minute of silence.
const getProjectLength = (): number => {
	let end = 0
	let hasContent = false
	for (const layer of layerStore.layers as LayerT[]) {
		const contentEnd = getContentEnd(layer)
		if (contentEnd === null) continue
		hasContent = true
		end = Math.max(end, contentEnd)
	}
	if (!hasContent) return DEFAULT_PROJECT_SECONDS
	return Math.max(MIN_PROJECT_SECONDS, end)
}

// Where an audio or video clip ends on the timeline, or null for a
// layer that has no clip of its own.
const getContentEnd = (layer: LayerT): number | null => {
	const isAudio = layer.kind === 'audio'
	const isVideo = layer.kind === 'video'
	if (!isAudio && !isVideo) return null
	const fileLength = isAudio ? (audioLayerBuffers.get(layer.id)?.duration ?? 0) : getVideoDuration(layer.assetId)
	const hasFile = fileLength > 0
	if (!hasFile) return null
	const naturalEnd = layer.startTime + Math.max(0, fileLength - layer.sourceOffset)
	return layer.endTime ?? naturalEnd
}

// Rebuilds the silent base when the project grows or shrinks.
const applyProjectLength = (nextLength: number): void => {
	if (app.isRecording) return
	const isSame = Math.abs(nextLength - app.duration) < 0.001
	if (isSame) return
	const wasFullRange = app.trimEnd >= app.duration - 0.01
	app.duration = nextLength
	audioBuffer = buildSilentBuffer(nextLength)
	if (wasFullRange || app.trimEnd > nextLength) app.trimEnd = nextLength
	app.trimStart = Math.min(app.trimStart, Math.max(0, app.trimEnd - MIN_CLIP_SECONDS))
	app.loopEnd = Math.min(app.loopEnd, nextLength)
	app.loopStart = Math.min(app.loopStart, Math.max(0, app.loopEnd - MIN_CLIP_SECONDS))
	if (app.playMarker > nextLength) app.playMarker = nextLength
	if (app.currentTime > nextLength) app.currentTime = nextLength
	const canRestart = app.isPlaying && audioBuffer !== null
	if (canRestart) {
		syncExtraTracks()
		startPlayback(audioBuffer as AudioBuffer, getPlaybackTime(), null, handleEnded)
	}
	if (!app.isPlaying) setPausedPosition(app.currentTime)
	markDirty()
}

export const startRecording = async (): Promise<void> => {
	const canvas = canvasElement
	const buffer = audioBuffer
	const canRecord = app.hasAudio && buffer !== null && canvas !== null && !app.isRecording
	if (!canRecord || buffer === null || canvas === null) return

	const format = pickRecorderFormat()
	if (format === null) {
		const message = 'This browser cannot record video. Try Chrome or Edge on desktop.'
		setStatus(message, 'danger')
		toaster.show({ title: 'Recording unavailable', description: message, tone: 'danger' })
		return
	}

	pausePlayback()
	setActiveLoop(null)
	app.isPlaying = false
	setPausedPosition(app.trimStart)
	recorderFormat = format
	app.recorderLabel = format.label

	syncExtraTracks()
	const tap = createRecordingTap()
	const frameRate = app.settings.frameRate
	app.isRecording = true
	app.isPlaying = true
	app.recordProgress = 0
	markDirty()
	await new Promise((resolve) => requestAnimationFrame(resolve))

	activeRecording = startRecorder(canvas, frameRate, tap.stream, format)
	const clip = {
		duration: getClipLength(),
		fadeIn: app.settings.audioFadeIn,
		fadeOut: app.settings.audioFadeOut
	}
	startPlayback(buffer, app.trimStart, tap, handleEnded, clip)
	setStatus('Recording in real time. Keep this tab visible until it finishes.', 'warning')
}

// The first audio never takes over the project's tempo by itself.
// The tempo it found is offered, and the user decides.
const offerTempo = (found: AnalysisT): void => {
	app.beatOffset = computeBeatOffset(found.flux, app.bpm)
	app.downbeatAnchor = null
	const isDifferent = Math.abs(found.bpm - app.bpm) >= 0.05
	app.pendingBpm = isDifferent ? found.bpm : null
}

export const applyPendingBpm = (): void => {
	const pending = app.pendingBpm
	app.pendingBpm = null
	if (pending === null) return
	setBpm(pending)
}

export const dismissPendingBpm = (): void => {
	app.pendingBpm = null
}

const takeTempo = (found: AnalysisT): void => {
	app.bpm = found.bpm
	app.beatOffset = found.beatOffset
	app.downbeatAnchor = null
}

export const setProjectName = (text: string): void => {
	app.projectName = text.slice(0, 80)
	app.isProjectNameEdited = true
}

const BEATS_PER_BAR = 4

const getBarLength = (bpm: number): number => (60 / bpm) * BEATS_PER_BAR

// Bar 1 starts within the first bar of the song, so bar
// numbers stay small and positive.
const wrapToFirstBar = (time: number, bpm: number): number => {
	const barLength = getBarLength(bpm)
	const wrapped = time % barLength
	const isNegative = wrapped < 0
	if (isNegative) return wrapped + barLength
	return wrapped
}

// A hand-set downbeat stays put. Otherwise the phase is found
// again for the new tempo, the same way detection finds it.
const resolveBeatOffset = (bpm: number): number => {
	const anchor = app.downbeatAnchor
	const hasAnchor = anchor !== null
	if (hasAnchor) return wrapToFirstBar(anchor, bpm)
	return computeBeatOffset(detectedAnalysis.flux, bpm)
}

export const setBpm = (value: number): void => {
	const isNumber = Number.isFinite(value)
	const isInRange = value >= 40 && value <= 240
	if (!isNumber || !isInRange) return
	app.bpm = value
	app.beatOffset = resolveBeatOffset(value)
}

// Back to what the analysis found, tempo and downbeat both.
export const detectBpm = (): void => {
	app.bpm = detectedAnalysis.bpm
	app.beatOffset = detectedAnalysis.beatOffset
	app.downbeatAnchor = null
}

export const setDownbeatAt = (time: number): void => {
	app.downbeatAnchor = time
	app.beatOffset = wrapToFirstBar(time, app.bpm)
}

export const nudgeDownbeat = (seconds: number): void => {
	const anchor = app.downbeatAnchor ?? app.beatOffset
	setDownbeatAt(anchor + seconds)
}

export const checkIsTempoEdited = (): boolean => {
	const isBpmEdited = app.bpm !== detectedAnalysis.bpm
	const isDownbeatEdited = app.downbeatAnchor !== null
	return isBpmEdited || isDownbeatEdited
}

// Switching theme swaps the two colors, so custom colors survive.
export const setTheme = (mode: ModeT): void => {
	const isSameTheme = app.settings.mode === mode
	if (isSameTheme) return
	const previousBackground = app.settings.background
	app.settings.background = app.settings.foreground
	app.settings.foreground = previousBackground
	app.settings.mode = mode
}

// Volume lanes change what is heard as the song plays.
const followVolumeAutomation = (time: number): void => {
	const audioLayers = layerStore.layers.filter((layer) => extraLayerIds.includes(layer.id)) as LayerT[]
	const live = applyLayerAutomation(audioLayers, app.settings, automation.lanes, time)
	const volumes = extraLayerIds.map((layerId) => live.find((layer) => layer.id === layerId)?.transform.volume ?? 1)
	setExtraVolumes(volumes)
}

const restartMixIfPlaying = (): void => {
	const canRestart = app.isPlaying && !app.isRecording && audioBuffer !== null
	if (!canRestart || audioBuffer === null) return
	syncExtraTracks()
	startExtras(getPlaybackTime())
}

const startWatchers = (): void => {
	$effect.root(() => {
		$effect(() => {
			JSON.stringify(app.settings)
			JSON.stringify(automation.lanes)
			JSON.stringify(layerStore.layers)
			void layerStore.assetVersion
			void app.projectName
			void app.bpm
			void app.beatOffset
			void getCompiledSources()
			void appliedPalette
			void app.isLayersReady
			void app.isPlaying
			markDirty()
		})

		$effect(() => {
			saveSettings($state.snapshot(app.settings))
		})

		// The song's analysis follows its clip around the timeline.
		$effect(() => {
			const next = readSongPlacement()
			const isFirstPlacement = untrack(() => songPlacement === null)
			if (isFirstPlacement) {
				songPlacement = next
				return
			}
			const timer = setTimeout(() => (songPlacement = next), PLACEMENT_DELAY)
			return () => clearTimeout(timer)
		})

		// The project is as long as its audio and video.
		$effect(() => {
			void audioVersion
			void layerStore.assetVersion
			const nextLength = getProjectLength()
			untrack(() => applyProjectLength(nextLength))
		})

		$effect(() => {
			void audioVersion
			const layerKey = layerStore.layers.map((layer) => `${layer.id}:${layer.kind}`).join('|')
			void layerKey
			untrack(syncSongSource)
		})

		// Changing an audio layer while the song plays restarts the mix
		// from where it is, so the change is heard at once.
		$effect(() => {
			const audioLayers = layerStore.layers.filter((layer) => layer.kind === 'audio')
			const mixKey = audioLayers.map((layer) => [layer.id, layer.startTime, layer.endTime, layer.sourceOffset, layer.isVisible].join(':')).join('|')
			void mixKey
			untrack(restartMixIfPlaying)
		})

		// Color edits rebuild the tinted layers after a short delay
		// so dragging a color picker stays smooth.
		$effect(() => {
			const nextPalette = readPalette(app.settings)
			const timer = setTimeout(() => (appliedPalette = nextPalette), PALETTE_DELAY)
			return () => clearTimeout(timer)
		})
	})
}

export const startApp = async (): Promise<void> => {
	startWatchers()
	startLayerWatchers()
	startAutomationWatchers()
	startSourceWatchers()
	startAppearanceWatchers()
	setVideoFrameListener(markDirty)
	useSilentBase()
	const format = pickRecorderFormat()
	app.recorderLabel = format === null ? 'No video recording' : format.label

	document.addEventListener('visibilitychange', () => {
		const isHiddenWhileRecording = document.hidden && app.isRecording
		if (!isHiddenWhileRecording) return
		toaster.show({
			title: 'Keep this tab visible',
			description: 'Background tabs are throttled, which drops frames.',
			tone: 'warning'
		})
	})

	await document.fonts.load('900 52px "DM Sans"')
	layers = await buildLogoLayers()
	app.isLayersReady = true
	await restoreLayerAssets()
	await restoreAudioLayers()
}

// ---- Audio layers -------------------------------------------

const getLayerName = (fileName: string): string => titleFromFileName(fileName).slice(0, 40)

// What the analyzer found in each decoded file. Copies of a layer
// share their original's buffer, so they share its analysis too.
const analysisByBuffer = new WeakMap<AudioBuffer, AnalysisT>()

const getFileAnalysis = async (buffer: AudioBuffer, onProgress: (fraction: number) => void): Promise<AnalysisT> => {
	const cached = analysisByBuffer.get(buffer)
	if (cached !== undefined) return cached
	const found = await analyzeAudio(buffer, onProgress)
	analysisByBuffer.set(buffer, found)
	return found
}

type AdoptModeT = 'offer' | 'restore' | 'quiet'

// The audio layer the picture listens to. 'offer' is a first audio
// being added, whose tempo is offered. 'restore' brings back the
// project's tempo. 'quiet' keeps the tempo as it is.
const adoptSong = async (layerId: string, mode: AdoptModeT): Promise<void> => {
	const layer = findLayer(layerId)
	const buffer = audioLayerBuffers.get(layerId)
	if (layer === undefined || buffer === undefined) return
	app.songLayerId = layerId
	app.hasSong = true
	app.fileName = layer.name
	app.isAnalyzing = true
	app.analysisProgress = 0
	setStatus(`Reading ${layer.name}…`)
	try {
		const found = await getFileAnalysis(buffer, (fraction) => (app.analysisProgress = fraction))
		const isStillSong = app.songLayerId === layerId
		if (!isStillSong) return
		songSource = { layerId, analysis: found }
		app.kickCount = found.kicks.length
		if (mode === 'offer') offerTempo(found)
		if (mode === 'restore') takeTempo(found)
		if (mode === 'offer') resetLoopRegion()
		const isNamable = mode === 'offer' && !app.isProjectNameEdited
		if (isNamable) app.projectName = titleFromFileName(layer.name)
		markDirty()
		const length = formatTime(buffer.duration)
		setStatus(`${layer.name} · ${length} · ${found.kicks.length} kicks · ${Math.round(found.bpm)} BPM`, 'success')
	} catch {
		const message = 'That audio could not be analyzed.'
		setStatus(message, 'danger')
		toaster.show({ title: 'Could not analyze audio', description: message, tone: 'danger' })
	} finally {
		app.isAnalyzing = false
	}
}

const clearSong = (): void => {
	songSource = null
	songPlacement = null
	app.songLayerId = null
	app.hasSong = false
	app.fileName = ''
	app.kickCount = 0
	app.pendingBpm = null
	setStatus(DEMO_STATUS)
	markDirty()
}

const findFirstAudioLayer = (): LayerT | undefined => {
	const audioLayers = (layerStore.layers as LayerT[]).filter((layer) => layer.kind === 'audio')
	return audioLayers.find((layer) => audioLayerBuffers.has(layer.id))
}

let isRestoringAudio = false

// Deleting the audio the picture listens to hands the job to the next
// audio layer, or to the demo beat if there is none. Undo brings it
// back the same way.
const syncSongSource = (): void => {
	if (isRestoringAudio) return
	const currentId = app.songLayerId
	const current = currentId === null ? undefined : findLayer(currentId)
	const isCurrentValid = current !== undefined && audioLayerBuffers.has(current.id)
	if (isCurrentValid) return
	const next = findFirstAudioLayer()
	if (next === undefined) {
		if (currentId !== null) clearSong()
		return
	}
	void adoptSong(next.id, 'quiet')
}

// Where the song's clip sits on the timeline, as the analysis needs it.
const readSongPlacement = (): ClipPlacementT | null => {
	const layerId = songSource?.layerId
	const layer = layerId === undefined ? undefined : findLayer(layerId)
	const buffer = layerId === undefined ? undefined : audioLayerBuffers.get(layerId)
	if (layer === undefined || buffer === undefined) return null
	const naturalEnd = layer.startTime + Math.max(0, buffer.duration - layer.sourceOffset)
	const endTime = layer.endTime ?? naturalEnd
	return { startTime: layer.startTime, endTime: Math.min(endTime, naturalEnd), sourceOffset: layer.sourceOffset }
}

export type AddAudioOptionsT = {
	// A restored file is already stored and keeps the project's tempo.
	isRestore: boolean
}

// Every audio file becomes an audio layer. The first one is also the
// audio the picture listens to, and its tempo is offered to the
// project. Later ones can be asked for their tempo in their settings.
export const addAudioFile = async (file: File, options: AddAudioOptionsT = { isRestore: false }): Promise<void> => {
	if (app.isRecording) return
	try {
		const decoded = await decodeAudioFile(file)
		const layer = createAudioLayer('', getLayerName(file.name))
		layer.assetId = layer.id
		audioLayerBuffers.set(layer.id, decoded)
		audioVersion += 1
		if (!options.isRestore) recordHistory()
		layerStore.layers.push(layer)
		if (!options.isRestore) selectLayer(layer.id)
		const isFirstAudio = app.songLayerId === null
		const mode: AdoptModeT = options.isRestore ? 'restore' : 'offer'
		const adoption = isFirstAudio ? adoptSong(layer.id, mode) : null
		if (!options.isRestore) await storeLayerFile(layer.id, file).catch(() => {
			toaster.show({ title: 'Audio not saved', description: 'It will need adding again after a reload.', tone: 'warning' })
		})
		if (adoption !== null) await adoption
	} catch {
		const message = 'That file could not be read. Try a WAV or MP3.'
		toaster.show({ title: 'Could not add the audio', description: message, tone: 'danger' })
	}
}

export const restoreAudioLayers = async (): Promise<void> => {
	isRestoringAudio = true
	let missingCount = 0
	try {
		const audioLayers = layerStore.layers.filter((layer) => layer.kind === 'audio' && layer.assetId !== null)
		for (const layer of audioLayers) {
			const assetId = layer.assetId
			if (assetId === null) continue
			try {
				const file = await readLayerFile(assetId, layer.name)
				if (file === null) throw new Error('missing')
				audioLayerBuffers.set(layer.id, await decodeAudioFile(file))
			} catch {
				missingCount += 1
			}
		}
		audioVersion += 1
	} finally {
		isRestoringAudio = false
	}
	const first = findFirstAudioLayer()
	if (first !== undefined) await adoptSong(first.id, 'restore')
	const hasMissing = missingCount > 0
	if (!hasMissing) return
	toaster.show({ title: 'Some audio layers are missing', description: `${missingCount} audio file(s) could not be restored. Those layers are silent.`, tone: 'warning' })
}

// The tempo found in one audio layer, or null if it can not be read.
export const detectLayerBpm = async (layerId: string, onProgress: (fraction: number) => void): Promise<number | null> => {
	const buffer = audioLayerBuffers.get(layerId)
	if (buffer === undefined) return null
	const found = await getFileAnalysis(buffer, onProgress)
	return found.bpm
}

// The tempo already found in a layer's file, if it was analyzed.
export const getKnownLayerBpm = (layerId: string): number | null => {
	const buffer = audioLayerBuffers.get(layerId)
	if (buffer === undefined) return null
	return analysisByBuffer.get(buffer)?.bpm ?? null
}
