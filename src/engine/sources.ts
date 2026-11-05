import { applyRelease, buildRise, findFirstHitIndex, normalizeToPercentile, pickHits } from './analysis'
import { GRID_STEP, clamp } from './settings'
import { buildRangeLevel, checkHasSpectrum } from './spectrum'
import type {
	BandSourceIdT,
	BandSourceT,
	CompiledBandT,
	CompiledSourcesT,
	CompiledTrackT,
	CustomSourceIdT,
	HitT,
	HitTrackT,
	SpectrumT,
	TrackSourceIdT
} from './types'

// Turns the user's hit tracks and frequency bands into plain,
// sorted data the frame loop can read cheaply.

export const DEFAULT_TRACK_DECAY = 0.14
export const MIN_TRACK_DECAY = 0.02
export const MAX_TRACK_DECAY = 1.5
export const MIN_BAND_RELEASE = 0.02
export const MAX_BAND_RELEASE = 1
const BAND_HIT_GAP_SECONDS = 0.09
const ENVELOPE_LOOKBACK_DECAYS = 6
const MAX_ENVELOPE_HITS = 12

export const getTrackSourceId = (trackId: string): TrackSourceIdT => `track:${trackId}`

export const getBandSourceId = (bandId: string): BandSourceIdT => `band:${bandId}`

export const checkIsCustomSource = (source: string): source is CustomSourceIdT => {
	const isTrack = source.startsWith('track:')
	const isBand = source.startsWith('band:')
	return isTrack || isBand
}

export const buildEmptySources = (): CompiledSourcesT => ({ tracks: [], bands: [] })

export const sortHitsByTime = <TimedT extends { time: number }>(hits: TimedT[]): TimedT[] => {
	return [...hits].sort((first, second) => first.time - second.time)
}

export const compileTrack = (track: HitTrackT): CompiledTrackT => {
	const engineHits: HitT[] = track.hits.map((hit) => ({ time: hit.time, strength: hit.strength, length: hit.length }))
	return {
		sourceId: getTrackSourceId(track.id),
		name: track.name,
		hits: sortHitsByTime(engineHits),
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
	const emptyBand: CompiledBandT = { sourceId, name: band.name, series: new Float32Array(0), hits: [], output: band.output, release: band.release }
	if (!hasSpectrum) return emptyBand

	const rawLevel = buildRangeLevel(spectrum, band.lowHz, band.highHz)
	const normalized = normalizeToPercentile(rawLevel, 0.97)
	const series = clampSeries(applyRelease(normalized, band.release))
	const isHits = band.output === 'hits'
	const thresholdScale = getThresholdScale(band.sensitivity)
	const hits = isHits ? pickHits(buildRise(normalized), BAND_HIT_GAP_SECONDS, thresholdScale) : []
	return { sourceId, name: band.name, series, hits, output: band.output, release: band.release }
}

const readSeries = (series: Float32Array, time: number): number => {
	const lastIndex = series.length - 1
	if (lastIndex < 0) return 0
	const index = clamp(Math.floor(time / GRID_STEP), 0, lastIndex)
	return series[index]
}

const getPulseLevel = (hit: HitT, time: number, decay: number): number => {
	const age = time - hit.time
	return hit.strength * Math.exp(-age / decay)
}

// Full strength while the note is held, then the same fade
// a pulse has.
const getGateLevel = (hit: HitT, time: number, decay: number): number => {
	const age = time - hit.time
	const length = hit.length ?? 0
	const isHeld = age <= length
	if (isHeld) return hit.strength
	return hit.strength * Math.exp(-(age - length) / decay)
}

type EnvelopeInputT = {
	hits: HitT[]
	time: number
	decay: number
	isGate: boolean
	lookback: number
}

// The strongest recent hit at this instant, 0-1.
const getEnvelope = (input: EnvelopeInputT): number => {
	const startIndex = findFirstHitIndex(input.hits, input.time - input.lookback)
	const recentHits = input.hits.slice(startIndex, startIndex + MAX_ENVELOPE_HITS)
	let envelope = 0
	for (const hit of recentHits) {
		const hasNotHappenedYet = hit.time > input.time
		if (hasNotHappenedYet) break
		const pulseLevel = getPulseLevel(hit, input.time, input.decay)
		const gateLevel = getGateLevel(hit, input.time, input.decay)
		const level = input.isGate ? gateLevel : pulseLevel
		envelope = Math.max(envelope, level)
	}
	return clamp(envelope, 0, 1)
}

const getLongestHit = (hits: HitT[]): number => {
	let longest = 0
	for (const hit of hits) longest = Math.max(longest, hit.length ?? 0)
	return longest
}

// Gate tracks look further back so a long held note still
// counts. Cached per hits array, since it only changes on edit.
const longestHitCache = new WeakMap<HitT[], number>()

const getCachedLongestHit = (hits: HitT[]): number => {
	const cached = longestHitCache.get(hits)
	if (cached !== undefined) return cached
	const longest = getLongestHit(hits)
	longestHitCache.set(hits, longest)
	return longest
}

export const getTrackSignal = (track: CompiledTrackT, time: number): number => {
	const isGate = track.shape === 'gate'
	const holdLookback = isGate ? getCachedLongestHit(track.hits) : 0
	const lookback = holdLookback + track.decay * ENVELOPE_LOOKBACK_DECAYS
	return getEnvelope({ hits: track.hits, time, decay: track.decay, isGate, lookback })
}

export const getBandSignal = (band: CompiledBandT, time: number): number => {
	const isHits = band.output === 'hits'
	if (!isHits) return readSeries(band.series, time)
	const lookback = band.release * ENVELOPE_LOOKBACK_DECAYS
	return getEnvelope({ hits: band.hits, time, decay: band.release, isGate: false, lookback })
}

// Detected-hit envelope with the built-in fade, for the kick
// and snare sources.
export const getDetectedHitSignal = (hits: HitT[], time: number): number => {
	const lookback = DEFAULT_TRACK_DECAY * ENVELOPE_LOOKBACK_DECAYS
	return getEnvelope({ hits, time, decay: DEFAULT_TRACK_DECAY, isGate: false, lookback })
}

export const getCustomSourceName = (source: CustomSourceIdT, sources: CompiledSourcesT): string | null => {
	const track = sources.tracks.find((candidate) => candidate.sourceId === source)
	if (track !== undefined) return track.name
	const band = sources.bands.find((candidate) => candidate.sourceId === source)
	if (band !== undefined) return band.name
	return null
}
