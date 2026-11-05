import { clamp } from './settings'

// The visible window of the song, in seconds. Every track in
// the editor (ruler, waveform, lanes, overview) maps time to
// x through the same view, so they always line up.
export type TimelineViewT = {
	start: number
	span: number
}

export type GridLineKindT = 'label' | 'bar' | 'beat' | 'sub'

export type GridLineT = {
	time: number
	kind: GridLineKindT
	label: string | null
}

export type TimelineGridT = {
	lines: GridLineT[]
	snapStep: number
	beatLength: number
	beatOffset: number
}

export type BuildGridInputT = {
	view: TimelineViewT
	duration: number
	widthPx: number
	bpm: number
	beatOffset: number
}

export const MIN_VIEW_SPAN = 0.5
const BEATS_PER_BAR = 4
const LABEL_MIN_PX = 56
const LINE_MIN_PX = 10
const BEAT_LABEL_MIN_PX = 72
const MAX_GRID_LINES = 600
const LABEL_BAR_STEPS = [1, 2, 4, 8, 16, 32, 64, 128, 256]

export const getViewEnd = (view: TimelineViewT): number => view.start + view.span

export const clampView = (view: TimelineViewT, duration: number): TimelineViewT => {
	const hasDuration = duration > 0
	if (!hasDuration) return { start: 0, span: 1 }
	const minSpan = Math.min(MIN_VIEW_SPAN, duration)
	const span = clamp(view.span, minSpan, duration)
	const start = clamp(view.start, 0, duration - span)
	return { start, span }
}

export const timeToRatio = (time: number, view: TimelineViewT): number => {
	return (time - view.start) / view.span
}

export const ratioToTime = (ratio: number, view: TimelineViewT): number => {
	return view.start + ratio * view.span
}

export const timeToPercent = (time: number, view: TimelineViewT): number => {
	return timeToRatio(time, view) * 100
}

export const checkIsTimeVisible = (time: number, view: TimelineViewT): boolean => {
	const isAfterStart = time >= view.start
	const isBeforeEnd = time <= getViewEnd(view)
	return isAfterStart && isBeforeEnd
}

// Zooms by a factor (below 1 zooms in) while keeping the
// anchor time under the same x position.
export const zoomView = (view: TimelineViewT, factor: number, anchorTime: number, duration: number): TimelineViewT => {
	const anchorRatio = timeToRatio(anchorTime, view)
	const nextSpan = view.span * factor
	const nextStart = anchorTime - anchorRatio * nextSpan
	return clampView({ start: nextStart, span: nextSpan }, duration)
}

export const panView = (view: TimelineViewT, deltaSeconds: number, duration: number): TimelineViewT => {
	const nextStart = view.start + deltaSeconds
	return clampView({ start: nextStart, span: view.span }, duration)
}

const pickLabelBarStep = (pxPerBar: number): number => {
	const step = LABEL_BAR_STEPS.find((candidate) => candidate * pxPerBar >= LABEL_MIN_PX)
	return step ?? LABEL_BAR_STEPS[LABEL_BAR_STEPS.length - 1]
}

// The finest beat division that still leaves room between lines.
const pickLineBeatStep = (pxPerBeat: number, labelBarStep: number): number => {
	const hasRoomForSixteenths = pxPerBeat / 4 >= LINE_MIN_PX
	if (hasRoomForSixteenths) return 0.25
	const hasRoomForEighths = pxPerBeat / 2 >= LINE_MIN_PX
	if (hasRoomForEighths) return 0.5
	const hasRoomForBeats = pxPerBeat >= LINE_MIN_PX
	if (hasRoomForBeats) return 1
	const hasRoomForBars = pxPerBeat * BEATS_PER_BAR >= LINE_MIN_PX
	if (hasRoomForBars) return BEATS_PER_BAR
	return labelBarStep * BEATS_PER_BAR
}

type ClassifyInputT = {
	beatPosition: number
	labelBarStep: number
	hasBeatLabels: boolean
}

const classifyLine = (input: ClassifyInputT): Omit<GridLineT, 'time'> => {
	const isWholeBeat = Number.isInteger(input.beatPosition)
	if (!isWholeBeat) return { kind: 'sub', label: null }
	const beatInBar = ((input.beatPosition % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR
	const barIndex = Math.floor(input.beatPosition / BEATS_PER_BAR)
	const barNumber = barIndex + 1
	const isBarStart = beatInBar === 0
	const isLabelBar = isBarStart && barIndex % input.labelBarStep === 0
	if (isLabelBar) return { kind: 'label', label: String(barNumber) }
	if (isBarStart) return { kind: 'bar', label: null }
	const beatLabel = input.hasBeatLabels ? `${barNumber}.${beatInBar + 1}` : null
	return { kind: 'beat', label: beatLabel }
}

// Musical grid from the detected tempo: bar numbers as labels,
// beats and sixteenths as finer lines when there is room.
export const buildGrid = (input: BuildGridInputT): TimelineGridT => {
	const beatLength = 60 / Math.max(1, input.bpm)
	const beatOffset = input.beatOffset
	const emptyGrid: TimelineGridT = { lines: [], snapStep: beatLength, beatLength, beatOffset }
	const hasRoom = input.widthPx > 0 && input.view.span > 0
	if (!hasRoom) return emptyGrid

	const pxPerBeat = (input.widthPx / input.view.span) * beatLength
	const labelBarStep = pickLabelBarStep(pxPerBeat * BEATS_PER_BAR)
	const beatStep = pickLineBeatStep(pxPerBeat, labelBarStep)
	const stepSeconds = beatStep * beatLength
	const hasBeatLabels = pxPerBeat >= BEAT_LABEL_MIN_PX

	const visibleStart = Math.max(0, input.view.start)
	const visibleEnd = Math.min(input.duration, getViewEnd(input.view))
	const firstStep = Math.ceil((visibleStart - beatOffset) / stepSeconds)
	const lastStep = Math.floor((visibleEnd - beatOffset) / stepSeconds)
	const stepCount = Math.min(MAX_GRID_LINES, lastStep - firstStep + 1)

	const lines: GridLineT[] = []
	for (const offset of Array.from({ length: Math.max(0, stepCount) }, (_, index) => index)) {
		const stepIndex = firstStep + offset
		const beatPosition = stepIndex * beatStep
		const time = beatOffset + stepIndex * stepSeconds
		const classified = classifyLine({ beatPosition, labelBarStep, hasBeatLabels })
		lines.push({ time, kind: classified.kind, label: classified.label })
	}

	return { lines, snapStep: stepSeconds, beatLength, beatOffset }
}

export const snapToGrid = (time: number, grid: TimelineGridT): number => {
	const stepsFromOffset = Math.round((time - grid.beatOffset) / grid.snapStep)
	return grid.beatOffset + stepsFromOffset * grid.snapStep
}

export const formatPreciseTime = (seconds: number): string => {
	const safeSeconds = Math.max(0, seconds)
	const minutes = Math.floor(safeSeconds / 60)
	const remainder = safeSeconds - minutes * 60
	const wholeSeconds = Math.floor(remainder)
	const hundredths = Math.floor((remainder - wholeSeconds) * 100)
	const paddedSeconds = String(wholeSeconds).padStart(2, '0')
	const paddedHundredths = String(hundredths).padStart(2, '0')
	return `${minutes}:${paddedSeconds}.${paddedHundredths}`
}

export const formatBarBeat = (seconds: number, bpm: number, beatOffset: number): string => {
	const beatLength = 60 / Math.max(1, bpm)
	const beatPosition = Math.floor((seconds - beatOffset) / beatLength)
	const barIndex = Math.floor(beatPosition / BEATS_PER_BAR)
	const beatInBar = ((beatPosition % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR
	return `${barIndex + 1}.${beatInBar + 1}`
}

// Whole tempos read plain. Corrected ones keep one decimal.
export const formatBpm = (bpm: number): string => String(Number(bpm.toFixed(1)))
