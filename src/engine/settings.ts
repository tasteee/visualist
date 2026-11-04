import type { SettingsT, EchoStylesT } from './types'

export const GRID_STEP = 0.01
export const FLICKER_RATE = 14
export const DEMO_LOOP_SECONDS = 90
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
	logoBorder: 0.85,
	accent1: '#f546cd',
	accent2: '#0af5b4',
	background: '#f9f9fa',
	foreground: '#28001c',
	reactivity: 1,
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
	echoStyles: allEchoStyles(),
	resolution: '1080',
	frameRate: 30
})

const STORAGE_KEY = 'vink.settings.v2'

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
