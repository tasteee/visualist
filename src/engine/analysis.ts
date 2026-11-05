import { GRID_STEP, clamp } from './settings'
import { buildSpectrum } from './spectrum'
import type { AnalysisT, AudioLevelsT, HitT } from './types'

const FRAMES_PER_SECOND = 100
const ENERGY_WINDOW_FRAMES = 180
const ONSET_WINDOW_FRAMES = 60
const MIN_BPM = 75
const MAX_BPM = 170
const TEMPO_PRIOR_CENTER = 118
const TEMPO_PRIOR_WIDTH_OCTAVES = 0.5

type BiquadT = {
	b0: number
	b1: number
	b2: number
	a1: number
	a2: number
}

// RBJ cookbook filters at Q = 1/sqrt(2). Two in a row give a
// steeper 24 dB per octave slope.
const buildBiquad = (kind: 'low' | 'high', frequency: number, sampleRate: number): BiquadT => {
	const omega = (2 * Math.PI * frequency) / sampleRate
	const cosOmega = Math.cos(omega)
	const alpha = Math.sin(omega) / (2 * Math.SQRT1_2)
	const a0 = 1 + alpha
	const isLow = kind === 'low'
	const b0Raw = isLow ? (1 - cosOmega) / 2 : (1 + cosOmega) / 2
	const b1Raw = isLow ? 1 - cosOmega : -(1 + cosOmega)
	return {
		b0: b0Raw / a0,
		b1: b1Raw / a0,
		b2: b0Raw / a0,
		a1: (-2 * cosOmega) / a0,
		a2: (1 - alpha) / a0
	}
}

const runBiquad = (filter: BiquadT, input: Float32Array): Float32Array => {
	const output = new Float32Array(input.length)
	let x1 = 0
	let x2 = 0
	let y1 = 0
	let y2 = 0
	for (let index = 0; index < input.length; index++) {
		const sample = input[index]
		const result = filter.b0 * sample + filter.b1 * x1 + filter.b2 * x2 - filter.a1 * y1 - filter.a2 * y2
		output[index] = result
		x2 = x1
		x1 = sample
		y2 = y1
		y1 = result
	}
	return output
}

const runCascade = (filters: BiquadT[], input: Float32Array): Float32Array => {
	let signal = input
	for (const filter of filters) signal = runBiquad(filter, signal)
	return signal
}

const mixToMono = (buffer: AudioBuffer): Float32Array => {
	const mono = new Float32Array(buffer.length)
	const channelCount = buffer.numberOfChannels
	for (let channel = 0; channel < channelCount; channel++) {
		const channelData = buffer.getChannelData(channel)
		for (let index = 0; index < mono.length; index++) mono[index] += channelData[index] / channelCount
	}
	return mono
}

const measureRms = (signal: Float32Array, sampleRate: number): Float32Array => {
	const samplesPerFrame = Math.max(1, Math.round(sampleRate / FRAMES_PER_SECOND))
	const frameCount = Math.ceil(signal.length / samplesPerFrame)
	const rms = new Float32Array(frameCount)
	for (let frame = 0; frame < frameCount; frame++) {
		const start = frame * samplesPerFrame
		const end = Math.min(signal.length, start + samplesPerFrame)
		let sum = 0
		for (let index = start; index < end; index++) sum += signal[index] * signal[index]
		const count = Math.max(1, end - start)
		rms[frame] = Math.sqrt(sum / count)
	}
	return rms
}

const getPercentile = (values: Float32Array, percentile: number): number => {
	if (values.length === 0) return 0
	const sorted = Float32Array.from(values).sort()
	const position = Math.floor(clamp(percentile, 0, 1) * (sorted.length - 1))
	return sorted[position]
}

// Normalized to the series' own 97th percentile so quiet and
// loud masters behave alike. The floor keeps silence from
// dividing by zero.
export const normalizeToPercentile = (values: Float32Array, percentile: number): Float32Array => {
	const reference = Math.max(getPercentile(values, percentile), 1e-6)
	const normalized = new Float32Array(values.length)
	for (let index = 0; index < values.length; index++) normalized[index] = Math.min(1.5, values[index] / reference)
	return normalized
}

// Instant attack, exponential release.
export const applyRelease = (values: Float32Array, releaseSeconds: number): Float32Array => {
	const decayPerFrame = Math.exp(-GRID_STEP / releaseSeconds)
	const output = new Float32Array(values.length)
	let held = 0
	for (let index = 0; index < values.length; index++) {
		held = Math.max(values[index], held * decayPerFrame)
		output[index] = held
	}
	return output
}

const buildEnergy = (low: Float32Array, level: Float32Array): Float32Array => {
	const blended = new Float32Array(low.length)
	for (let index = 0; index < low.length; index++) blended[index] = 0.6 * low[index] + 0.4 * level[index]

	const prefix = new Float64Array(blended.length + 1)
	for (let index = 0; index < blended.length; index++) prefix[index + 1] = prefix[index] + blended[index]

	const averaged = new Float32Array(blended.length)
	const halfWindow = Math.floor(ENERGY_WINDOW_FRAMES / 2)
	for (let index = 0; index < blended.length; index++) {
		const start = Math.max(0, index - halfWindow)
		const end = Math.min(blended.length, index + halfWindow)
		averaged[index] = (prefix[end] - prefix[start]) / Math.max(1, end - start)
	}

	const normalized = normalizeToPercentile(averaged, 0.95)
	for (let index = 0; index < normalized.length; index++) normalized[index] = clamp(normalized[index], 0, 1)
	return normalized
}

// Log-compressed rise in level over two frames.
export const buildRise = (series: Float32Array): Float32Array => {
	const rise = new Float32Array(series.length)
	const compression = 50
	for (let index = 2; index < series.length; index++) {
		const now = Math.log1p(compression * series[index])
		const before = Math.log1p(compression * series[index - 2])
		rise[index] = Math.max(0, now - before)
	}
	return rise
}

// thresholdScale above 1 asks for stronger onsets, below 1
// lets quieter ones through.
export const pickHits = (rise: Float32Array, minGapSeconds: number, thresholdScale = 1): HitT[] => {
	const prefix = new Float64Array(rise.length + 1)
	for (let index = 0; index < rise.length; index++) prefix[index + 1] = prefix[index] + rise[index]

	const referenceRise = Math.max(getPercentile(rise, 0.9), 1e-6)
	const floorThreshold = 0.12 * referenceRise
	const minGapFrames = Math.round(minGapSeconds * FRAMES_PER_SECOND)
	const hits: HitT[] = []
	let lastHitFrame = -minGapFrames

	for (let frame = 1; frame < rise.length - 1; frame++) {
		const value = rise[frame]
		const isLocalPeak = value >= rise[frame - 1] && value > rise[frame + 1]
		if (!isLocalPeak) continue

		const start = Math.max(0, frame - ONSET_WINDOW_FRAMES)
		const end = Math.min(rise.length, frame + ONSET_WINDOW_FRAMES)
		const localAverage = (prefix[end] - prefix[start]) / Math.max(1, end - start)
		const threshold = (1.8 * localAverage + floorThreshold) * thresholdScale
		const isAboveThreshold = value > threshold
		if (!isAboveThreshold) continue

		const strength = clamp((value / referenceRise) * 0.8, 0.35, 1.2)
		const hit: HitT = { time: frame * GRID_STEP, strength }
		const isTooClose = frame - lastHitFrame < minGapFrames
		const lastHit = hits[hits.length - 1]
		const isStrongerThanLast = lastHit !== undefined && strength > lastHit.strength
		if (isTooClose && isStrongerThanLast) hits[hits.length - 1] = hit
		if (isTooClose) continue
		hits.push(hit)
		lastHitFrame = frame
	}

	return hits
}

type TempoScoreT = {
	score: number
	phase: number
}

const scoreTempo = (flux: Float32Array, bpm: number): TempoScoreT => {
	const period = 60 / bpm
	let sumCos = 0
	let sumSin = 0
	let total = 0
	for (let frame = 0; frame < flux.length; frame++) {
		const weight = flux[frame]
		if (weight <= 0) continue
		const angle = (2 * Math.PI * (frame * GRID_STEP)) / period
		sumCos += weight * Math.cos(angle)
		sumSin += weight * Math.sin(angle)
		total += weight
	}
	if (total === 0) return { score: 0, phase: 0 }
	return { score: Math.hypot(sumCos, sumSin) / total, phase: Math.atan2(sumSin, sumCos) }
}

// Seconds from the start of the song to where beat 1 falls.
export const computeBeatOffset = (flux: Float32Array, bpm: number): number => {
	const period = 60 / bpm
	const tempo = scoreTempo(flux, bpm)
	const turns = tempo.phase / (2 * Math.PI)
	const offset = turns * period
	const isNegative = offset < 0
	if (isNegative) return offset + period
	return offset
}

const getTempoPrior = (bpm: number): number => {
	const octaves = Math.log2(bpm / TEMPO_PRIOR_CENTER)
	const normalized = octaves / TEMPO_PRIOR_WIDTH_OCTAVES
	return Math.exp(-0.5 * normalized * normalized)
}

export const detectTempo = (flux: Float32Array): number => {
	let bestBpm = 120
	let bestScore = -1
	for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.5) {
		const tempo = scoreTempo(flux, bpm)
		const weightedScore = tempo.score * getTempoPrior(bpm)
		const isBetter = weightedScore > bestScore
		if (!isBetter) continue
		bestScore = weightedScore
		bestBpm = bpm
	}

	let refinedBpm = bestBpm
	let refinedScore = -1
	for (let step = -10; step <= 10; step++) {
		const candidate = bestBpm + step * 0.05
		const tempo = scoreTempo(flux, candidate)
		const isBetter = tempo.score > refinedScore
		if (!isBetter) continue
		refinedScore = tempo.score
		refinedBpm = candidate
	}

	return Math.round(refinedBpm * 10) / 10
}

const waitForPaint = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

export type AnalysisProgressT = (fraction: number) => void

export const analyzeAudio = async (buffer: AudioBuffer, onProgress?: AnalysisProgressT): Promise<AnalysisT> => {
	const report = (fraction: number) => onProgress?.(fraction)
	const sampleRate = buffer.sampleRate
	const mono = mixToMono(buffer)
	report(0.1)
	await waitForPaint()

	const lowSignal = runCascade([buildBiquad('low', 140, sampleRate), buildBiquad('low', 140, sampleRate)], mono)
	const lowRaw = normalizeToPercentile(measureRms(lowSignal, sampleRate), 0.97)
	report(0.3)
	await waitForPaint()

	const midFilters = [
		buildBiquad('high', 220, sampleRate),
		buildBiquad('high', 220, sampleRate),
		buildBiquad('low', 3500, sampleRate),
		buildBiquad('low', 3500, sampleRate)
	]
	const midSignal = runCascade(midFilters, mono)
	const midRaw = normalizeToPercentile(measureRms(midSignal, sampleRate), 0.97)
	report(0.5)
	await waitForPaint()

	const highFilters = [buildBiquad('high', 3500, sampleRate), buildBiquad('high', 3500, sampleRate)]
	const highSignal = runCascade(highFilters, mono)
	const highRaw = normalizeToPercentile(measureRms(highSignal, sampleRate), 0.97)
	const levelRaw = normalizeToPercentile(measureRms(mono, sampleRate), 0.97)
	report(0.7)
	await waitForPaint()

	const snapSource = new Float32Array(midRaw.length)
	for (let index = 0; index < snapSource.length; index++) snapSource[index] = Math.max(midRaw[index], highRaw[index])

	const lowRise = buildRise(lowRaw)
	const snapRise = buildRise(snapSource)
	const kicks = pickHits(lowRise, 0.14)
	const snaps = pickHits(snapRise, 0.09)

	const flux = new Float32Array(lowRise.length)
	for (let index = 0; index < flux.length; index++) flux[index] = lowRise[index] + snapRise[index]

	const bpm = detectTempo(flux)
	const beatOffset = computeBeatOffset(flux, bpm)
	report(0.75)
	await waitForPaint()

	const reportSpectrum = (fraction: number) => report(0.75 + fraction * 0.23)
	const spectrum = await buildSpectrum(mono, sampleRate, reportSpectrum)
	report(0.98)

	return {
		duration: buffer.duration,
		low: applyRelease(lowRaw, 0.12),
		mid: applyRelease(midRaw, 0.1),
		high: applyRelease(highRaw, 0.08),
		level: levelRaw,
		energy: buildEnergy(lowRaw, levelRaw),
		flux,
		kicks,
		snaps,
		bpm,
		beatOffset,
		spectrum,
		isDemo: false
	}
}

const readSeries = (series: Float32Array, time: number): number => {
	const lastIndex = series.length - 1
	if (lastIndex < 0) return 0
	const index = clamp(Math.floor(time / GRID_STEP), 0, lastIndex)
	return series[index]
}

export const getLevels = (analysis: AnalysisT, time: number): AudioLevelsT => ({
	low: readSeries(analysis.low, time),
	mid: readSeries(analysis.mid, time),
	high: readSeries(analysis.high, time),
	energy: readSeries(analysis.energy, time)
})

// First hit at or after the given time, by binary search.
export const findFirstHitIndex = (hits: HitT[], time: number): number => {
	let low = 0
	let high = hits.length
	while (low < high) {
		const middle = (low + high) >> 1
		const isBefore = hits[middle].time < time
		if (isBefore) low = middle + 1
		if (!isBefore) high = middle
	}
	return low
}
