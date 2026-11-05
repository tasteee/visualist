import { clamp } from './settings'
import { DEFAULT_TRACK_DECAY, sortHitsByTime } from './sources'
import type { HitRoleT, HitT, HitTrackT, TrackHitT } from './types'

// Pure helpers for editing hit tracks: building hits, painting
// step patterns across a range, and snapping to the beat grid.

export const PATTERN_STEPS = 16
export const STEPS_PER_BEAT = 4
export const DEFAULT_HIT_STRENGTH = 0.85
export const MIN_HIT_GAP = 0.01

export type TempoT = {
	bpm: number
	beatOffset: number
}

export type TimeRangeT = {
	start: number
	end: number
}

export const createHitId = (): string => crypto.randomUUID()

export const createHit = (time: number, strength: number, length: number): TrackHitT => ({
	id: createHitId(),
	time: Math.max(0, time),
	strength: clamp(strength, 0, 1),
	length: Math.max(0, length)
})

export type NewTrackInputT = {
	name: string
	role: HitRoleT
	hits: TrackHitT[]
}

export const buildHitTrack = (input: NewTrackInputT): HitTrackT => ({
	id: crypto.randomUUID(),
	name: input.name,
	hits: sortHitsByTime(input.hits),
	decay: DEFAULT_TRACK_DECAY,
	shape: 'pulse',
	role: input.role
})

// Detected strengths run past 1 on the loudest hits.
export const convertDetectedHits = (hits: HitT[]): TrackHitT[] => {
	return hits.map((hit) => createHit(hit.time, clamp(hit.strength, 0, 1), 0))
}

export const getStepLength = (tempo: TempoT): number => 60 / Math.max(1, tempo.bpm) / STEPS_PER_BEAT

export const snapToStep = (time: number, tempo: TempoT): number => {
	const stepLength = getStepLength(tempo)
	const stepIndex = Math.round((time - tempo.beatOffset) / stepLength)
	return tempo.beatOffset + stepIndex * stepLength
}

const getStepIndexes = (range: TimeRangeT, tempo: TempoT): number[] => {
	const stepLength = getStepLength(tempo)
	const firstStep = Math.ceil((range.start - tempo.beatOffset) / stepLength - 1e-6)
	const lastStep = Math.ceil((range.end - tempo.beatOffset) / stepLength - 1e-6) - 1
	const stepCount = Math.max(0, lastStep - firstStep + 1)
	return Array.from({ length: stepCount }, (_, offset) => firstStep + offset)
}

const getPatternIndex = (stepIndex: number): number => ((stepIndex % PATTERN_STEPS) + PATTERN_STEPS) % PATTERN_STEPS

// Steps line up with bars, since the beat offset is where bar
// 1 starts. A step strength of 0 is a rest.
export const buildPatternHits = (pattern: number[], range: TimeRangeT, tempo: TempoT): TrackHitT[] => {
	const stepLength = getStepLength(tempo)
	const hits: TrackHitT[] = []
	for (const stepIndex of getStepIndexes(range, tempo)) {
		const strength = pattern[getPatternIndex(stepIndex)] ?? 0
		const isRest = strength <= 0
		if (isRest) continue
		const time = tempo.beatOffset + stepIndex * stepLength
		const isBeforeSong = time < 0
		if (isBeforeSong) continue
		hits.push(createHit(time, strength, stepLength))
	}
	return hits
}

export const checkIsInRange = (time: number, range: TimeRangeT): boolean => time >= range.start && time < range.end

// The hits outside the range, plus the new ones, in order.
export const replaceHitsInRange = (hits: TrackHitT[], range: TimeRangeT, replacements: TrackHitT[]): TrackHitT[] => {
	const kept = hits.filter((hit) => !checkIsInRange(hit.time, range))
	return sortHitsByTime([...kept, ...replacements])
}

// Reads the pattern back out of a range: the strongest hit on
// each step, folded onto the 16 steps of a bar.
export const readPatternFromRange = (hits: TrackHitT[], range: TimeRangeT, tempo: TempoT): number[] => {
	const stepLength = getStepLength(tempo)
	const pattern = Array.from({ length: PATTERN_STEPS }, () => 0)
	const hitsInRange = hits.filter((hit) => checkIsInRange(hit.time, range))
	for (const hit of hitsInRange) {
		const stepIndex = Math.round((hit.time - tempo.beatOffset) / stepLength)
		const patternIndex = getPatternIndex(stepIndex)
		pattern[patternIndex] = Math.max(pattern[patternIndex], hit.strength)
	}
	return pattern
}

// Two hits closer than this would read as one, so the newer
// one replaces the older.
export const insertHit = (hits: TrackHitT[], hit: TrackHitT): TrackHitT[] => {
	const kept = hits.filter((existing) => Math.abs(existing.time - hit.time) >= MIN_HIT_GAP)
	return sortHitsByTime([...kept, hit])
}

export const getRoleLabel = (role: HitRoleT): string => {
	if (role === 'kick') return 'Drives Kick'
	if (role === 'snare') return 'Drives Snare'
	return 'Own source only'
}

export const HIT_ROLE_OPTIONS: { value: HitRoleT; label: string }[] = [
	{ value: 'none', label: getRoleLabel('none') },
	{ value: 'kick', label: getRoleLabel('kick') },
	{ value: 'snare', label: getRoleLabel('snare') }
]

export const formatHitCount = (count: number): string => {
	if (count === 0) return 'No hits'
	if (count === 1) return '1 hit'
	return `${count} hits`
}
