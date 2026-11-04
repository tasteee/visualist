// Read straight from the layout so settings can import this
// file without a cycle through logoLayers.
import layout from '../assets/logo-layers/layout.json'
import type { AspectRatioT } from './types'

const SCENE_HEIGHT = layout.H

export type FormatPresetT = {
	value: AspectRatioT
	name: string
	platforms: string
	ratioWidth: number
	ratioHeight: number
}

export type SizeT = {
	width: number
	height: number
}

// Where the 16:9 scene sits inside a frame of another shape.
// The scene is scaled around its center to fit the frame width.
export type FrameLayoutT = {
	width: number
	height: number
	sceneScale: number
}

export const DEFAULT_ASPECT_RATIO: AspectRatioT = '16:9'

export const FORMAT_PRESETS: FormatPresetT[] = [
	{ value: '16:9', name: 'Landscape', platforms: 'YouTube · Facebook · X', ratioWidth: 16, ratioHeight: 9 },
	{ value: '9:16', name: 'Vertical', platforms: 'TikTok · Reels · Shorts · Stories', ratioWidth: 9, ratioHeight: 16 },
	{ value: '1:1', name: 'Square', platforms: 'Instagram · Facebook feed', ratioWidth: 1, ratioHeight: 1 },
	{ value: '4:5', name: 'Portrait', platforms: 'Instagram · Facebook feed', ratioWidth: 4, ratioHeight: 5 }
]

// The logo plus a little air on each side, in scene units.
// Narrow frames shrink the scene until this width fits.
const SCENE_CONTENT_WIDTH = 1360

const findPreset = (aspectRatio: AspectRatioT): FormatPresetT => {
	const preset = FORMAT_PRESETS.find((candidate) => candidate.value === aspectRatio)
	if (preset === undefined) return FORMAT_PRESETS[0]
	return preset
}

export const getFormatPreset = (aspectRatio: AspectRatioT): FormatPresetT => findPreset(aspectRatio)

export const checkIsAspectRatio = (value: unknown): value is AspectRatioT => {
	const isKnown = FORMAT_PRESETS.some((preset) => preset.value === value)
	return isKnown
}

// Encoders want even sizes, so both sides round to even pixels.
const roundToEven = (value: number): number => Math.round(value / 2) * 2

// Sizes a frame so its shorter side is shortSide pixels long.
export const getSizeForShortSide = (aspectRatio: AspectRatioT, shortSide: number): SizeT => {
	const preset = findPreset(aspectRatio)
	const isLandscape = preset.ratioWidth >= preset.ratioHeight
	const longSideRatio = Math.max(preset.ratioWidth, preset.ratioHeight)
	const shortSideRatio = Math.min(preset.ratioWidth, preset.ratioHeight)
	const longSide = roundToEven((shortSide * longSideRatio) / shortSideRatio)
	const evenShortSide = roundToEven(shortSide)
	if (isLandscape) return { width: longSide, height: evenShortSide }
	return { width: evenShortSide, height: longSide }
}

// The frame in scene units. 16:9 is exactly the scene, so the
// classic YouTube output does not change at all.
export const getFrameLayout = (aspectRatio: AspectRatioT): FrameLayoutT => {
	const size = getSizeForShortSide(aspectRatio, SCENE_HEIGHT)
	const widthFit = size.width / SCENE_CONTENT_WIDTH
	const heightFit = size.height / SCENE_HEIGHT
	const sceneScale = Math.min(1, widthFit, heightFit)
	return { width: size.width, height: size.height, sceneScale }
}
