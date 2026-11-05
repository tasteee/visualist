import { getLevels } from './analysis'
import { AUTOMATION_CONTROLS } from './automation'
import { clamp } from './settings'
import { checkIsCustomSource, getBandSignal, getCustomSourceName, getDetectedHitSignal, getTrackSignal } from './sources'
import type { AnalysisT, BuiltInSourceT, CompiledSourcesT, ModSourceT, ModulationT, SettingsT, SignalsT } from './types'

export type ModSourceOptionT = {
	value: ModSourceT
	label: string
}

type BuiltInOptionT = {
	value: BuiltInSourceT
	label: string
}

export type ParamRangeT = {
	min: number
	max: number
}

export const MOD_SOURCES: BuiltInOptionT[] = [
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

const BEAT_DECAY = 5
const BEATS_PER_BAR = 4
const MISSING_SOURCE_LABEL = 'Missing source'

export const getModSourceLabel = (source: ModSourceT, sources: CompiledSourcesT): string => {
	const isCustom = checkIsCustomSource(source)
	if (isCustom) return getCustomSourceName(source, sources) ?? MISSING_SOURCE_LABEL
	const option = MOD_SOURCES.find((candidate) => candidate.value === source)
	if (option === undefined) return source
	return option.label
}

// Built-ins first, then the user's tracks and bands. A source
// a modulation still points at but which is gone stays listed,
// so the dropdown can show what is selected.
export const listModSourceOptions = (sources: CompiledSourcesT, selected: ModSourceT | null): ModSourceOptionT[] => {
	const trackOptions: ModSourceOptionT[] = sources.tracks.map((track) => ({ value: track.sourceId, label: `Track · ${track.name}` }))
	const bandOptions: ModSourceOptionT[] = sources.bands.map((band) => ({ value: band.sourceId, label: `Band · ${band.name}` }))
	const options: ModSourceOptionT[] = [...MOD_SOURCES, ...trackOptions, ...bandOptions]
	const isSelectedListed = selected === null || options.some((option) => option.value === selected)
	if (isSelectedListed) return options
	return [...options, { value: selected, label: MISSING_SOURCE_LABEL }]
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
export const computeSignals = (analysis: AnalysisT, time: number, sources: CompiledSourcesT): SignalsT => {
	const levels = getLevels(analysis, time)
	const beatCount = getBeatCount(time, analysis.bpm, analysis.beatOffset)

	const signals: SignalsT = {
		bass: clamp(levels.low, 0, 1),
		mids: clamp(levels.mid, 0, 1),
		highs: clamp(levels.high, 0, 1),
		energy: clamp(levels.energy, 0, 1),
		kick: getDetectedHitSignal(analysis.kicks, time),
		snare: getDetectedHitSignal(analysis.snaps, time),
		beat: getBeatPulse(beatCount),
		bar: getBarWave(beatCount)
	}

	for (const track of sources.tracks) signals[track.sourceId] = getTrackSignal(track, time)
	for (const band of sources.bands) signals[band.sourceId] = getBandSignal(band, time)
	return signals
}

export const applyModulation = (base: number, range: ParamRangeT, modulation: ModulationT | null | undefined, signals: SignalsT): number => {
	const hasModulation = modulation !== null && modulation !== undefined
	if (!hasModulation) return base
	const span = range.max - range.min
	const signal = signals[modulation.source] ?? 0
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

export const formatModulation = (modulation: ModulationT, sources: CompiledSourcesT): string => {
	const percent = Math.round(modulation.amount * 100)
	const sign = percent > 0 ? '+' : ''
	const sourceLabel = getModSourceLabel(modulation.source, sources)
	return `${sourceLabel} ${sign}${percent}%`
}
