import type { SettingsT, EchoStylesT } from './types'

export const GRID_STEP = 0.01
export const FLICKER_RATE = 14
export const DEFAULT_INK_DURATION = 90
export const MIN_INK_SPAN = 3
export const TAIL_SECONDS = 0.6

const allEchoStyles = (): EchoStylesT => ({
	hollow: true,
	faintFill: true,
	double: true,
	sliced: true,
	gritty: true
})

export const createDefaultSettings = (): SettingsT => ({
	mode: 'light',
	logoSeparation: 0.85,
	accent1: '#f546cd',
	accent2: '#0af5b4',
	ink: '#28001c',
	paper: '#f9f9fa',
	reactivity: 1,
	isBeatBounceOn: true,
	isEchoesOn: true,
	isGlitchOn: true,
	isTextureOn: true,
	isSolidOn: true,
	echoAmount: 0.9,
	echoSize: 1,
	echoSpeed: 1,
	glitchAmount: 0.8,
	textureAmount: 0.75,
	solidAmount: 1,
	bassBounce: 1,
	echoStyles: allEchoStyles(),
	isInkOn: false,
	inkStart: 4,
	inkDoneBeforeEnd: 5,
	titleSize: 52,
	titleColor: 'auto',
	resolution: '1080',
	frameRate: 30
})

export type PresetNameT = 'clean' | 'default' | 'wild'

type PresetT = Partial<SettingsT>

// Presets only touch the settings they list. Toggles, colors,
// mode, ink and output settings are left as the user set them.
export const getPreset = (name: PresetNameT): PresetT => {
	const defaults = createDefaultSettings()

	if (name === 'clean') {
		const cleanStyles: EchoStylesT = { ...allEchoStyles(), double: false, sliced: false }
		return {
			echoAmount: 0.6,
			solidAmount: 0.5,
			bassBounce: 0.7,
			glitchAmount: 0.35,
			textureAmount: 0.35,
			logoSeparation: 1,
			echoStyles: cleanStyles
		}
	}

	if (name === 'wild') {
		return {
			echoAmount: 1.5,
			solidAmount: 1.5,
			bassBounce: 1.4,
			glitchAmount: 1.5,
			textureAmount: 1.2,
			logoSeparation: 0.4,
			echoStyles: allEchoStyles()
		}
	}

	return {
		echoAmount: defaults.echoAmount,
		solidAmount: defaults.solidAmount,
		bassBounce: defaults.bassBounce,
		glitchAmount: defaults.glitchAmount,
		textureAmount: defaults.textureAmount,
		logoSeparation: defaults.logoSeparation,
		echoStyles: allEchoStyles()
	}
}

// Which preset the current settings exactly match, if any.
export const findActivePreset = (settings: SettingsT): PresetNameT | null => {
	const names: PresetNameT[] = ['clean', 'default', 'wild']
	for (const name of names) {
		const preset = getPreset(name)
		const isMatch = checkMatchesPreset(settings, preset)
		if (isMatch) return name
	}
	return null
}

const checkMatchesPreset = (settings: SettingsT, preset: PresetT): boolean => {
	const keys = Object.keys(preset) as (keyof SettingsT)[]
	for (const key of keys) {
		const presetValue = JSON.stringify(preset[key])
		const settingsValue = JSON.stringify(settings[key])
		const isSame = presetValue === settingsValue
		if (!isSame) return false
	}
	return true
}

const STORAGE_KEY = 'vink.settings.v1'

export const loadSettings = (): SettingsT => {
	const defaults = createDefaultSettings()
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY)
		if (stored === null) return defaults
		const parsed = JSON.parse(stored) as Partial<SettingsT>
		const echoStyles = { ...defaults.echoStyles, ...parsed.echoStyles }
		return { ...defaults, ...parsed, echoStyles }
	} catch {
		return defaults
	}
}

// If storage is blocked the app still works, it just forgets.
export const saveSettings = (settings: SettingsT): void => {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
	} catch {
		return
	}
}

export const clamp = (value: number, low: number, high: number): number => {
	return Math.min(high, Math.max(low, value))
}

export const getInkFinishTime = (settings: SettingsT, duration: number): number => {
	const naturalFinish = duration - settings.inkDoneBeforeEnd
	const earliestFinish = settings.inkStart + MIN_INK_SPAN
	return Math.max(earliestFinish, naturalFinish)
}
