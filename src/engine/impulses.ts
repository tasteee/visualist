import { clamp } from './settings'
import { DEFAULT_TRACK_DECAY, sortImpulsesByTime } from './sources'
import type { ImpulseRoleT, ImpulseT, ImpulseTrackT, TrackImpulseT } from './types'

// Pure helpers for editing impulse tracks: building impulses, painting
// step patterns across a range, and snapping to the beat grid.

export const PATTERN_STEPS = 16
export const STEPS_PER_BEAT = 4
export const DEFAULT_IMPULSE_STRENGTH = 0.85
export const MIN_IMPULSE_GAP = 0.01

export type TempoT = {
	bpm: number
	beatOffset: number
}

export type TimeRangeT = {
	start: number
	end: number
}

export const createImpulseId = (): string => crypto.randomUUID()

export const createImpulse = (time: number, strength: number, length: number): TrackImpulseT => ({
	id: createImpulseId(),
	time: Math.max(0, time),
	strength: clamp(strength, 0, 1),
	length: Math.max(0, length)
})

export type NewTrackInputT = {
	name: string
	role: ImpulseRoleT
	impulses: TrackImpulseT[]
}

export const buildImpulseTrack = (input: NewTrackInputT): ImpulseTrackT => ({
	id: crypto.randomUUID(),
	name: input.name,
	impulses: sortImpulsesByTime(input.impulses),
	decay: DEFAULT_TRACK_DECAY,
	shape: 'pulse',
	role: input.role
})

// Detected strengths run past 1 on the loudest impulses.
export const convertDetectedImpulses = (impulses: ImpulseT[]): TrackImpulseT[] => {
	return impulses.map((impulse) => createImpulse(impulse.time, clamp(impulse.strength, 0, 1), 0))
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
export const buildPatternImpulses = (pattern: number[], range: TimeRangeT, tempo: TempoT): TrackImpulseT[] => {
	const stepLength = getStepLength(tempo)
	const impulses: TrackImpulseT[] = []
	for (const stepIndex of getStepIndexes(range, tempo)) {
		const strength = pattern[getPatternIndex(stepIndex)] ?? 0
		const isRest = strength <= 0
		if (isRest) continue
		const time = tempo.beatOffset + stepIndex * stepLength
		const isBeforeSong = time < 0
		if (isBeforeSong) continue
		impulses.push(createImpulse(time, strength, stepLength))
	}
	return impulses
}

export const checkIsInRange = (time: number, range: TimeRangeT): boolean => time >= range.start && time < range.end

// The impulses outside the range, plus the new ones, in order.
export const replaceImpulsesInRange = (impulses: TrackImpulseT[], range: TimeRangeT, replacements: TrackImpulseT[]): TrackImpulseT[] => {
	const kept = impulses.filter((impulse) => !checkIsInRange(impulse.time, range))
	return sortImpulsesByTime([...kept, ...replacements])
}

// Reads the pattern back out of a range: the strongest impulse on
// each step, folded onto the 16 steps of a bar.
export const readPatternFromRange = (impulses: TrackImpulseT[], range: TimeRangeT, tempo: TempoT): number[] => {
	const stepLength = getStepLength(tempo)
	const pattern = Array.from({ length: PATTERN_STEPS }, () => 0)
	const impulsesInRange = impulses.filter((impulse) => checkIsInRange(impulse.time, range))
	for (const impulse of impulsesInRange) {
		const stepIndex = Math.round((impulse.time - tempo.beatOffset) / stepLength)
		const patternIndex = getPatternIndex(stepIndex)
		pattern[patternIndex] = Math.max(pattern[patternIndex], impulse.strength)
	}
	return pattern
}

// Two impulses closer than this would read as one, so the newer
// one replaces the older.
export const insertImpulse = (impulses: TrackImpulseT[], impulse: TrackImpulseT): TrackImpulseT[] => {
	const kept = impulses.filter((existing) => Math.abs(existing.time - impulse.time) >= MIN_IMPULSE_GAP)
	return sortImpulsesByTime([...kept, impulse])
}

export const getRoleLabel = (role: ImpulseRoleT): string => {
	if (role === 'kick') return 'Drives Kick'
	if (role === 'snare') return 'Drives Snare'
	return 'Own source only'
}

export const IMPULSE_ROLE_OPTIONS: { value: ImpulseRoleT; label: string }[] = [
	{ value: 'none', label: getRoleLabel('none') },
	{ value: 'kick', label: getRoleLabel('kick') },
	{ value: 'snare', label: getRoleLabel('snare') }
]

export const formatImpulseCount = (count: number): string => {
	if (count === 0) return 'No impulses'
	if (count === 1) return '1 impulse'
	return `${count} impulses`
}
