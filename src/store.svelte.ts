import { toaster } from '@tasteee/zest'
import { analyzeAudio } from './engine/analysis'
import {
	createRecordingTap,
	decodeAudioFile,
	getPlaybackTime,
	pausePlayback,
	setPausedPosition,
	startPlayback
} from './engine/audio'
import { automation, clampLanesToDuration, startAutomationWatchers } from './automation.svelte'
import { applyAutomation, applyLayerAutomation } from './engine/automation'
import { applySettingsModulation, computeSignals } from './engine/modulation'
import { applyPostEffects, getPostAmounts } from './engine/post'
import { layerStore, restoreLayerAssets, startLayerWatchers } from './layers.svelte'
import { buildDemoAnalysis } from './engine/demo'
import { buildLogoLayers } from './engine/logoLayers'
import type { LogoLayersT } from './engine/logoLayers'
import { startRecorder, pickRecorderFormat } from './engine/recorder'
import type { ActiveRecordingT, RecorderFormatT } from './engine/recorder'
import { drawFrame } from './engine/render'
import { getFadeLevel } from './engine/fades'
import { getSizeForShortSide } from './engine/formats'
import type { SizeT } from './engine/formats'
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
	title: string
	isTitleEdited: boolean
	bpm: number
	musicalKey: string
	musicalScale: string
	fileName: string
	hasAudio: boolean
	duration: number
	trimStart: number
	trimEnd: number
	kickCount: number
	isAnalyzing: boolean
	analysisProgress: number
	isLayersReady: boolean
	isPlaying: boolean
	isRecording: boolean
	currentTime: number
	recordProgress: number
	statusText: string
	statusTone: StatusToneT
	isDraggingFile: boolean
	recorderLabel: string
}

const PALETTE_DELAY = 120
// The live preview draws smaller than the export, so heavy
// effects stay smooth. Recording always uses the export size.
const PREVIEW_SHORT_SIDE = 810
const DEMO_STATUS = 'Previewing the built-in demo beat. Drop a song to begin.'

export const app = $state<AppStateT>({
	settings: loadSettings(),
	title: '',
	isTitleEdited: false,
	bpm: 120,
	musicalKey: '',
	musicalScale: '',
	fileName: '',
	hasAudio: false,
	duration: 0,
	trimStart: 0,
	trimEnd: 0,
	kickCount: 0,
	isAnalyzing: false,
	analysisProgress: 0,
	isLayersReady: false,
	isPlaying: false,
	isRecording: false,
	currentTime: 0,
	recordProgress: 0,
	statusText: DEMO_STATUS,
	statusTone: 'neutral',
	isDraggingFile: false,
	recorderLabel: ''
})

// Big typed arrays stay out of the deep proxy.
let analysis = $state.raw<AnalysisT>(buildDemoAnalysis())
let appliedPalette = $state.raw<PaletteT>(readPalette(app.settings))

let audioBuffer: AudioBuffer | null = null
let layers: LogoLayersT | null = null
let canvasElement: HTMLCanvasElement | null = null
let canvasContext: CanvasRenderingContext2D | null = null
let animationFrame = 0
let isDirty = true
let demoStartedAt = performance.now()
let activeRecording: ActiveRecordingT | null = null
let recorderFormat: RecorderFormatT | null = null

function readPalette(settings: SettingsT): PaletteT {
	return {
		accent1: settings.accent1,
		accent2: settings.accent2,
		background: settings.background,
		foreground: settings.foreground
	}
}

export const getAnalysis = (): AnalysisT => analysis
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

// Lanes set each control's base for this instant, then the
// modulations push it around with the music.
const buildFrameInput = (time: number): FrameInputT => {
	const signals = computeSignals(analysis, time)
	const automatedSettings = applyAutomation(app.settings, automation.lanes, time)
	const settings = applySettingsModulation(automatedSettings, signals)

	return {
		time,
		analysis,
		settings,
		palette: appliedPalette,
		bpm: analysis.bpm,
		beatOffset: analysis.beatOffset,
		title: app.title,
		isIntroActive: app.isPlaying || app.isRecording,
		layers: applyLayerAutomation(layerStore.layers as LayerT[], app.settings, automation.lanes, time),
		signals
	}
}

// The live mod sources at the playhead, for meters in the UI.
export const getLiveSignals = (): SignalsT => computeSignals(analysis, app.currentTime)

const renderFrame = (context: CanvasRenderingContext2D, time: number, logoLayers: LogoLayersT, width: number, height: number): void => {
	const input = buildFrameInput(time)
	drawFrame(context, input, logoLayers, width, height)
	applyPostEffects(context, getPostAmounts(input.settings), time)
}

const titleFromFileName = (fileName: string): string => {
	const withoutExtension = fileName.replace(/\.[^.]+$/, '')
	const spaced = withoutExtension.replace(/[_-]+/g, ' ')
	return spaced.replace(/\s+/g, ' ').trim().slice(0, 80)
}

const getBaseName = (fileName: string): string => fileName.replace(/\.[^.]+$/, '')

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
	const fileName = `${getBaseName(app.fileName)}-visualizer.${extension}`
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
	if (shouldDraw) renderFrame(context, time, currentLayers, size.width, size.height)
	const recordingElapsed = time - app.trimStart
	if (shouldDraw && app.isRecording) drawVideoFade(context, size.width, size.height, recordingElapsed)
	isDirty = false

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

const handleEnded = (): void => {
	if (app.isRecording) return
	setPausedPosition(0)
	app.isPlaying = false
	app.currentTime = 0
	markDirty()
}

export const togglePlay = (): void => {
	const canPlay = app.hasAudio && audioBuffer !== null && !app.isRecording
	if (!canPlay || audioBuffer === null) return

	if (app.isPlaying) {
		pausePlayback()
		app.isPlaying = false
		markDirty()
		return
	}

	const isAtEnd = getPlaybackTime() >= app.duration - 0.02
	const startAt = isAtEnd ? 0 : getPlaybackTime()
	startPlayback(audioBuffer, startAt, null, handleEnded)
	app.isPlaying = true
}

export const seekTo = (seconds: number): void => {
	const canSeek = app.hasAudio && audioBuffer !== null && !app.isRecording
	if (!canSeek || audioBuffer === null) return

	const target = clamp(seconds, 0, Math.max(0, app.duration - 0.01))
	app.currentTime = target
	markDirty()
	if (app.isPlaying) startPlayback(audioBuffer, target, null, handleEnded)
	if (!app.isPlaying) setPausedPosition(target)
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
	app.isPlaying = false
	setPausedPosition(app.trimStart)
	recorderFormat = format
	app.recorderLabel = format.label

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

const applyAnalysis = (nextAnalysis: AnalysisT): void => {
	analysis = nextAnalysis
	app.bpm = Math.round(nextAnalysis.bpm)
}

export const loadAudioFile = async (file: File): Promise<void> => {
	if (app.isRecording || app.isAnalyzing) return
	app.isAnalyzing = true
	app.analysisProgress = 0
	setStatus(`Reading ${file.name}…`)

	try {
		const decoded = await decodeAudioFile(file)
		const result = await analyzeAudio(decoded, (fraction) => (app.analysisProgress = fraction))

		pausePlayback()
		audioBuffer = decoded
		app.isPlaying = false
		app.hasAudio = true
		app.duration = decoded.duration
		app.trimStart = 0
		app.trimEnd = decoded.duration
		clampLanesToDuration(decoded.duration)
		app.fileName = file.name
		app.kickCount = result.kicks.length
		app.currentTime = 0
		setPausedPosition(0)
		applyAnalysis(result)
		if (!app.isTitleEdited) app.title = titleFromFileName(file.name)
		markDirty()

		const length = formatTime(decoded.duration)
		setStatus(`${file.name} · ${length} · ${result.kicks.length} kicks · ${Math.round(result.bpm)} BPM`, 'success')
	} catch {
		const message = 'That file could not be read. Try a WAV, MP3 or M4A.'
		setStatus(message, 'danger')
		toaster.show({ title: 'Could not load audio', description: message, tone: 'danger' })
	} finally {
		app.isAnalyzing = false
	}
}

export const setTitle = (text: string): void => {
	app.title = text.slice(0, 80)
	app.isTitleEdited = true
}

// The BPM control is display-only for now. Echo timing keeps
// following the detected tempo.
export const setBpm = (value: number): void => {
	const isNumber = Number.isFinite(value)
	const isInRange = value >= 40 && value <= 240
	if (!isNumber || !isInRange) return
	app.bpm = Math.round(value)
}

export const detectBpm = (): void => {
	app.bpm = Math.round(analysis.bpm)
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

const startWatchers = (): void => {
	$effect.root(() => {
		$effect(() => {
			JSON.stringify(app.settings)
			JSON.stringify(automation.lanes)
			JSON.stringify(layerStore.layers)
			void layerStore.assetVersion
			void app.title
			void app.bpm
			void appliedPalette
			void app.isLayersReady
			void app.isPlaying
			markDirty()
		})

		$effect(() => {
			saveSettings($state.snapshot(app.settings))
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
}
