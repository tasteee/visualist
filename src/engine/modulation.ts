import { findFirstHitIndex, getLevels } from './analysis'
import { AUTOMATION_CONTROLS } from './automation'
import { clamp } from './settings'
import type { AnalysisT, HitT, ModSourceT, ModulationT, SettingsT, SignalsT } from './types'

export type ModSourceOptionT = {
	value: ModSourceT
	label: string
}

export type ParamRangeT = {
	min: number
	max: number
}

export const MOD_SOURCES: ModSourceOptionT[] = [
	{ value: 'bass', label: 'Bass' },
	{ value: 'mids', label: 'Mids' },
	{ value: 'highs', label: 'Highs' },
	{ value: 'energy', label: 'Energy' },
	{ value: 'kick', label: 'Kick' },
	{ value: 'snare', label: 'Snare' },
	{ value: 'beat', label: 'Every beat' },
	{ value: 'bar', label: 'Every bar' }
]

export const DEFAULT_MOD_AMOUNT = 0.5

// How long a kick or snare keeps pushing after it lands.
const HIT_DECAY_SECONDS = 0.14
const HIT_WINDOW_SECONDS = 0.6
const BEAT_DECAY = 5
const BEATS_PER_BAR = 4

export const getModSourceLabel = (source: ModSourceT): string => {
	const option = MOD_SOURCES.find((candidate) => candidate.value === source)
	if (option === undefined) return source
	return option.label
}

// The strongest recent hit, fading out after it lands.
const getHitEnvelope = (hits: HitT[], time: number): number => {
	const startIndex = findFirstHitIndex(hits, time - HIT_WINDOW_SECONDS)
	const recentHits = hits.slice(startIndex, startIndex + 8)
	let envelope = 0
	for (const hit of recentHits) {
		const hasNotHappenedYet = hit.time > time
		if (hasNotHappenedYet) break
		const age = time - hit.time
		const level = hit.strength * Math.exp(-age / HIT_DECAY_SECONDS)
		envelope = Math.max(envelope, level)
	}
	return clamp(envelope, 0, 1)
}

const getBeatCount = (time: number, bpm: number, beatOffset: number): number => {
	const beatLength = 60 / bpm
	return (time - beatOffset) / beatLength
}

const getFraction = (value: number): number => value - Math.floor(value)

// A sharp hit on every beat that fades before the next one.
const getBeatPulse = (beatCount: number): number => {
	const phase = getFraction(beatCount)
	return Math.exp(-phase * BEAT_DECAY)
}

// A slow swell that rises and falls once per bar.
const getBarWave = (beatCount: number): number => {
	const phase = getFraction(beatCount / BEATS_PER_BAR)
	return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2)
}

// Every source is 0-1 at this instant. Pure function of time,
// so scrubbing and recording see the same values.
export const computeSignals = (analysis: AnalysisT, time: number): SignalsT => {
	const levels = getLevels(analysis, time)
	const beatCount = getBeatCount(time, analysis.bpm, analysis.beatOffset)

	return {
		bass: clamp(levels.low, 0, 1),
		mids: clamp(levels.mid, 0, 1),
		highs: clamp(levels.high, 0, 1),
		energy: clamp(levels.energy, 0, 1),
		kick: getHitEnvelope(analysis.kicks, time),
		snare: getHitEnvelope(analysis.snaps, time),
		beat: getBeatPulse(beatCount),
		bar: getBarWave(beatCount)
	}
}

export const applyModulation = (base: number, range: ParamRangeT, modulation: ModulationT | null | undefined, signals: SignalsT): number => {
	const hasModulation = modulation !== null && modulation !== undefined
	if (!hasModulation) return base
	const span = range.max - range.min
	const signal = signals[modulation.source]
	const push = modulation.amount * signal * span
	return clamp(base + push, range.min, range.max)
}

// Frame-time settings: every modulated control gets its push.
// Runs after automation, so lanes set the base and mods add.
export const applySettingsModulation = (settings: SettingsT, signals: SignalsT): SettingsT => {
	const modulations = settings.modulations
	const modulatedControls = AUTOMATION_CONTROLS.filter((control) => modulations[control.key] !== undefined)
	const hasModulation = modulatedControls.length > 0
	if (!hasModulation) return settings

	const live: SettingsT = { ...settings }
	for (const control of modulatedControls) {
		const modulation = modulations[control.key]
		live[control.key] = applyModulation(settings[control.key], control, modulation, signals)
	}
	return live
}

export const formatModulation = (modulation: ModulationT): string => {
	const percent = Math.round(modulation.amount * 100)
	const sign = percent > 0 ? '+' : ''
	return `${getModSourceLabel(modulation.source)} ${sign}${percent}%`
}
