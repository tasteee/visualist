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
import { buildDemoAnalysis } from './engine/demo'
import { buildLogoLayers } from './engine/logoLayers'
import type { LogoLayersT } from './engine/logoLayers'
import { startRecorder, pickRecorderFormat } from './engine/recorder'
import type { ActiveRecordingT, RecorderFormatT } from './engine/recorder'
import { drawFrame } from './engine/render'
import {
	DEMO_LOOP_SECONDS,
	TAIL_SECONDS,
	clamp,
	loadSettings,
	saveSettings
} from './engine/settings'
import type { AnalysisT, FrameInputT, ModeT, PaletteT, SettingsT } from './engine/types'

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

export const getOutputSize = (): { width: number; height: number } => {
	const is720 = app.settings.resolution === '720'
	if (is720) return { width: 1280, height: 720 }
	return { width: 1920, height: 1080 }
}

const getFrameTime = (): number => {
	if (app.hasAudio) return getPlaybackTime()
	const elapsed = (performance.now() - demoStartedAt) / 1000
	return elapsed % DEMO_LOOP_SECONDS
}

const buildFrameInput = (time: number): FrameInputT => ({
	time,
	analysis,
	settings: app.settings,
	palette: appliedPalette,
	bpm: analysis.bpm,
	beatOffset: analysis.beatOffset,
	title: app.title,
	isIntroActive: app.isPlaying || app.isRecording
})

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

const getRecordingLength = (): number => app.duration + TAIL_SECONDS

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
	setPausedPosition(0)
	app.currentTime = 0
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
	setPausedPosition(0)
	app.isRecording = false
	app.isPlaying = false
	app.recordProgress = 0
	app.currentTime = 0
	markDirty()
	setStatus('Recording cancelled. Nothing was saved.', 'warning')
}

const tick = (): void => {
	animationFrame = requestAnimationFrame(tick)
	const canvas = canvasElement
	const context = canvasContext
	const currentLayers = layers
	if (canvas === null || context === null || currentLayers === null) return

	const size = getOutputSize()
	const hasWrongSize = canvas.width !== size.width || canvas.height !== size.height
	if (hasWrongSize) {
		canvas.width = size.width
		canvas.height = size.height
		isDirty = true
	}

	const time = getFrameTime()
	const isAnimating = app.isPlaying || app.isRecording || !app.hasAudio
	const shouldDraw = isDirty || isAnimating
	if (shouldDraw) drawFrame(context, buildFrameInput(time), currentLayers, size.width, size.height)
	isDirty = false

	const visibleTime = app.hasAudio ? Math.min(time, app.duration) : time
	const hasTimeChanged = visibleTime !== app.currentTime
	if (hasTimeChanged) app.currentTime = visibleTime

	if (!app.isRecording) return
	app.recordProgress = clamp(time / getRecordingLength(), 0, 1)
	const isRecordingDone = time >= getRecordingLength()
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
	setPausedPosition(0)
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
	startPlayback(buffer, 0, tap, handleEnded)
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
}
