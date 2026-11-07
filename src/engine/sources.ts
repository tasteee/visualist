import { applyRelease, buildRise, findFirstImpulseIndex, normalizeToPercentile, pickImpulses } from './analysis'
import { GRID_STEP, clamp } from './settings'
import { buildRangeLevel, checkHasSpectrum } from './spectrum'
import type {
	BandSourceIdT,
	BandSourceT,
	CompiledBandT,
	CompiledSourcesT,
	CompiledTrackT,
	CustomSourceIdT,
	ImpulseT,
	ImpulseTrackT,
	SpectrumT,
	TrackSourceIdT
} from './types'

// Turns the user's impulse tracks and frequency bands into plain,
// sorted data the frame loop can read cheaply.

export const DEFAULT_TRACK_DECAY = 0.14
export const MIN_TRACK_DECAY = 0.02
export const MAX_TRACK_DECAY = 1.5
export const MIN_BAND_RELEASE = 0.02
export const MAX_BAND_RELEASE = 1
const BAND_IMPULSE_GAP_SECONDS = 0.09
const ENVELOPE_LOOKBACK_DECAYS = 6
const MAX_ENVELOPE_IMPULSES = 12

export const getTrackSourceId = (trackId: string): TrackSourceIdT => `track:${trackId}`

export const getBandSourceId = (bandId: string): BandSourceIdT => `band:${bandId}`

export const checkIsCustomSource = (source: string): source is CustomSourceIdT => {
	const isTrack = source.startsWith('track:')
	const isBand = source.startsWith('band:')
	return isTrack || isBand
}

export const buildEmptySources = (): CompiledSourcesT => ({ tracks: [], bands: [] })

export const sortImpulsesByTime = <TimedT extends { time: number }>(impulses: TimedT[]): TimedT[] => {
	return [...impulses].sort((first, second) => first.time - second.time)
}

export const compileTrack = (track: ImpulseTrackT): CompiledTrackT => {
	const engineImpulses: ImpulseT[] = track.impulses.map((impulse) => ({ time: impulse.time, strength: impulse.strength, length: impulse.length }))
	return {
		sourceId: getTrackSourceId(track.id),
		name: track.name,
		impulses: sortImpulsesByTime(engineImpulses),
		decay: track.decay,
		shape: track.shape
	}
}

// Sensitivity 0.5 is the detector's normal threshold. Each
// half step either way halves or doubles it.
const getThresholdScale = (sensitivity: number): number => Math.pow(2, (0.5 - sensitivity) * 2)

const clampSeries = (series: Float32Array): Float32Array => {
	const clamped = new Float32Array(series.length)
	for (const index of series.keys()) clamped[index] = clamp(series[index], 0, 1)
	return clamped
}

export const compileBand = (band: BandSourceT, spectrum: SpectrumT): CompiledBandT => {
	const sourceId = getBandSourceId(band.id)
	const hasSpectrum = checkHasSpectrum(spectrum)
	const emptyBand: CompiledBandT = { sourceId, name: band.name, series: new Float32Array(0), impulses: [], output: band.output, release: band.release }
	if (!hasSpectrum) return emptyBand

	const rawLevel = buildRangeLevel(spectrum, band.lowHz, band.highHz)
	const normalized = normalizeToPercentile(rawLevel, 0.97)
	const series = clampSeries(applyRelease(normalized, band.release))
	const isImpulses = band.output === 'impulses'
	const thresholdScale = getThresholdScale(band.sensitivity)
	const impulses = isImpulses ? pickImpulses(buildRise(normalized), BAND_IMPULSE_GAP_SECONDS, thresholdScale) : []
	return { sourceId, name: band.name, series, impulses, output: band.output, release: band.release }
}

const readSeries = (series: Float32Array, time: number): number => {
	const lastIndex = series.length - 1
	if (lastIndex < 0) return 0
	const index = clamp(Math.floor(time / GRID_STEP), 0, lastIndex)
	return series[index]
}

const getPulseLevel = (impulse: ImpulseT, time: number, decay: number): number => {
	const age = time - impulse.time
	return impulse.strength * Math.exp(-age / decay)
}

// Full strength while the note is held, then the same fade
// a pulse has.
const getGateLevel = (impulse: ImpulseT, time: number, decay: number): number => {
	const age = time - impulse.time
	const length = impulse.length ?? 0
	const isHeld = age <= length
	if (isHeld) return impulse.strength
	return impulse.strength * Math.exp(-(age - length) / decay)
}

type EnvelopeInputT = {
	impulses: ImpulseT[]
	time: number
	decay: number
	isGate: boolean
	lookback: number
}

// The strongest recent impulse at this instant, 0-1.
const getEnvelope = (input: EnvelopeInputT): number => {
	const startIndex = findFirstImpulseIndex(input.impulses, input.time - input.lookback)
	const recentImpulses = input.impulses.slice(startIndex, startIndex + MAX_ENVELOPE_IMPULSES)
	let envelope = 0
	for (const impulse of recentImpulses) {
		const hasNotHappenedYet = impulse.time > input.time
		if (hasNotHappenedYet) break
		const pulseLevel = getPulseLevel(impulse, input.time, input.decay)
		const gateLevel = getGateLevel(impulse, input.time, input.decay)
		const level = input.isGate ? gateLevel : pulseLevel
		envelope = Math.max(envelope, level)
	}
	return clamp(envelope, 0, 1)
}

const getLongestImpulse = (impulses: ImpulseT[]): number => {
	let longest = 0
	for (const impulse of impulses) longest = Math.max(longest, impulse.length ?? 0)
	return longest
}

// Gate tracks look further back so a long held note still
// counts. Cached per impulses array, since it only changes on edit.
const longestImpulseCache = new WeakMap<ImpulseT[], number>()

const getCachedLongestImpulse = (impulses: ImpulseT[]): number => {
	const cached = longestImpulseCache.get(impulses)
	if (cached !== undefined) return cached
	const longest = getLongestImpulse(impulses)
	longestImpulseCache.set(impulses, longest)
	return longest
}

export const getTrackSignal = (track: CompiledTrackT, time: number): number => {
	const isGate = track.shape === 'gate'
	const holdLookback = isGate ? getCachedLongestImpulse(track.impulses) : 0
	const lookback = holdLookback + track.decay * ENVELOPE_LOOKBACK_DECAYS
	return getEnvelope({ impulses: track.impulses, time, decay: track.decay, isGate, lookback })
}

export const getBandSignal = (band: CompiledBandT, time: number): number => {
	const isImpulses = band.output === 'impulses'
	if (!isImpulses) return readSeries(band.series, time)
	const lookback = band.release * ENVELOPE_LOOKBACK_DECAYS
	return getEnvelope({ impulses: band.impulses, time, decay: band.release, isGate: false, lookback })
}

// Detected-impulse envelope with the built-in fade, for the kick
// and snare sources.
export const getDetectedImpulseSignal = (impulses: ImpulseT[], time: number): number => {
	const lookback = DEFAULT_TRACK_DECAY * ENVELOPE_LOOKBACK_DECAYS
	return getEnvelope({ impulses, time, decay: DEFAULT_TRACK_DECAY, isGate: false, lookback })
}

export const getCustomSourceName = (source: CustomSourceIdT, sources: CompiledSourcesT): string | null => {
	const track = sources.tracks.find((candidate) => candidate.sourceId === source)
	if (track !== undefined) return track.name
	const band = sources.bands.find((candidate) => candidate.sourceId === source)
	if (band !== undefined) return band.name
	return null
}
