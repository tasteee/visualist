import { clamp } from './settings'
import { SPECTRUM_HIGHEST_HZ, SPECTRUM_LOWEST_HZ } from './spectrum'
import type { BandOutputT, BandSourceT } from './types'

export type BandPresetT = {
	value: string
	label: string
	lowHz: number
	highHz: number
	output: BandOutputT
}

// Rough homes of common parts of a mix. A starting point, not a
// rule: every mix sits a little differently.
export const BAND_PRESETS: BandPresetT[] = [
	{ value: 'sub', label: 'Sub', lowHz: 25, highHz: 60, output: 'level' },
	{ value: 'kick', label: 'Kick punch', lowHz: 45, highHz: 110, output: 'hits' },
	{ value: 'bass', label: 'Bass', lowHz: 60, highHz: 250, output: 'level' },
	{ value: 'snareBody', label: 'Snare body', lowHz: 150, highHz: 300, output: 'hits' },
	{ value: 'lowMids', label: 'Low mids', lowHz: 250, highHz: 500, output: 'level' },
	{ value: 'vocals', label: 'Vocals', lowHz: 300, highHz: 3000, output: 'level' },
	{ value: 'snap', label: 'Snare snap', lowHz: 2000, highHz: 5000, output: 'hits' },
	{ value: 'hats', label: 'Hats', lowHz: 6000, highHz: 12000, output: 'hits' },
	{ value: 'air', label: 'Air', lowHz: 10000, highHz: 16000, output: 'level' }
]

export const BAND_LOWEST_HZ = SPECTRUM_LOWEST_HZ
export const BAND_HIGHEST_HZ = SPECTRUM_HIGHEST_HZ
// The narrowest band allowed: about a sixth of an octave.
export const MIN_BAND_RATIO = 1.12
export const DEFAULT_BAND_RELEASE = 0.12
export const DEFAULT_BAND_SENSITIVITY = 0.5

export const BAND_OUTPUT_OPTIONS: { value: BandOutputT; label: string }[] = [
	{ value: 'level', label: 'Level' },
	{ value: 'hits', label: 'Hits' }
]

export type BandRangeT = {
	lowHz: number
	highHz: number
}

export const clampBandRange = (range: BandRangeT): BandRangeT => {
	const lowHz = clamp(range.lowHz, BAND_LOWEST_HZ, BAND_HIGHEST_HZ / MIN_BAND_RATIO)
	const highHz = clamp(range.highHz, lowHz * MIN_BAND_RATIO, BAND_HIGHEST_HZ)
	return { lowHz, highHz }
}

export const buildBand = (preset: BandPresetT): BandSourceT => ({
	id: crypto.randomUUID(),
	name: preset.label,
	lowHz: preset.lowHz,
	highHz: preset.highHz,
	output: preset.output,
	release: DEFAULT_BAND_RELEASE,
	sensitivity: DEFAULT_BAND_SENSITIVITY
})

const formatKilohertz = (hz: number): string => {
	const kilohertz = hz / 1000
	const isWhole = Math.abs(kilohertz - Math.round(kilohertz)) < 0.05
	const digits = isWhole ? 0 : 1
	return `${kilohertz.toFixed(digits)} kHz`
}

export const formatHz = (hz: number): string => {
	const isKilohertz = hz >= 1000
	if (isKilohertz) return formatKilohertz(hz)
	return `${Math.round(hz)} Hz`
}

export const formatBandRange = (band: BandRangeT): string => `${formatHz(band.lowHz)} – ${formatHz(band.highHz)}`

// Log frequency axis, 0-1 across the spectrum.
export const hzToRatio = (hz: number): number => {
	const span = Math.log2(BAND_HIGHEST_HZ / BAND_LOWEST_HZ)
	const position = Math.log2(Math.max(BAND_LOWEST_HZ, hz) / BAND_LOWEST_HZ)
	return clamp(position / span, 0, 1)
}

export const ratioToHz = (ratio: number): number => {
	const span = Math.log2(BAND_HIGHEST_HZ / BAND_LOWEST_HZ)
	return BAND_LOWEST_HZ * Math.pow(2, clamp(ratio, 0, 1) * span)
}
