import type { PaletteT } from './engine/types'

// The colors the user has made. Layers point at a color by id, so
// changing a color here changes it everywhere it is used. The app has
// no idea of a foreground or an accent: the stage needs a background
// color, and everything else picks what it wants from this list.
export type PaletteColorT = {
	id: string
	name: string
	value: string
}

type PaletteStateT = {
	colors: PaletteColorT[]
}

const STORAGE_KEY = 'vink.palette.v1'

// These ids are what saved layers already point at.
export const WHITE_COLOR_ID = 'white'
export const BLACK_COLOR_ID = 'black'
export const ACCENT_ONE_COLOR_ID = 'accent-1'
export const ACCENT_TWO_COLOR_ID = 'accent-2'

const FALLBACK_COLOR = '#ffffff'
const NEW_COLOR_VALUE = '#8a8f99'

const createDefaultColors = (): PaletteColorT[] => [
	{ id: WHITE_COLOR_ID, name: 'White', value: '#ffffff' },
	{ id: BLACK_COLOR_ID, name: 'Black', value: '#000000' },
	{ id: ACCENT_ONE_COLOR_ID, name: 'Pink', value: '#f546cd' },
	{ id: ACCENT_TWO_COLOR_ID, name: 'Mint', value: '#0af5b4' }
]

const checkIsColorShape = (color: Partial<PaletteColorT>): boolean => {
	const hasId = typeof color.id === 'string'
	const hasValue = typeof color.value === 'string'
	return hasId && hasValue
}

const loadColors = (): PaletteColorT[] => {
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY)
		if (stored === null) return createDefaultColors()
		const parsed = JSON.parse(stored) as Partial<PaletteColorT>[]
		if (!Array.isArray(parsed)) return createDefaultColors()
		return parsed.filter(checkIsColorShape).map((color) => ({ id: color.id as string, name: color.name ?? 'Color', value: color.value as string }))
	} catch {
		return createDefaultColors()
	}
}

export const palette = $state<PaletteStateT>({ colors: loadColors() })

export const findColor = (colorId: string): PaletteColorT | undefined => palette.colors.find((color) => color.id === colorId)

// A color that was deleted draws as white, so nothing disappears.
export const getColorValue = (colorId: string): string => findColor(colorId)?.value ?? FALLBACK_COLOR

let nextColorNumber = 1

const buildUniqueName = (): string => {
	const names = new Set(palette.colors.map((color) => color.name))
	let number = Math.max(nextColorNumber, palette.colors.length + 1)
	while (names.has(`Color ${number}`)) number += 1
	nextColorNumber = number + 1
	return `Color ${number}`
}

export const addColor = (value: string = NEW_COLOR_VALUE): string => {
	const color: PaletteColorT = { id: crypto.randomUUID(), name: buildUniqueName(), value }
	palette.colors.push(color)
	return color.id
}

export const removeColor = (colorId: string): void => {
	palette.colors = palette.colors.filter((color) => color.id !== colorId)
}

export const setColorValue = (colorId: string, value: string): void => {
	const color = findColor(colorId)
	if (color === undefined) return
	color.value = value.toLowerCase()
}

export const renameColor = (colorId: string, name: string): void => {
	const color = findColor(colorId)
	if (color === undefined) return
	color.name = name.slice(0, 24)
}

export const takePaletteSnapshot = (): PaletteColorT[] => $state.snapshot(palette.colors) as PaletteColorT[]

export const restorePaletteSnapshot = (colors: PaletteColorT[]): void => {
	palette.colors = colors
}

const checkIsDark = (hex: string): boolean => {
	const digits = hex.replace('#', '')
	const isShort = digits.length === 3
	const full = isShort ? digits.split('').map((digit) => digit + digit).join('') : digits
	const red = parseInt(full.slice(0, 2), 16)
	const green = parseInt(full.slice(2, 4), 16)
	const blue = parseInt(full.slice(4, 6), 16)
	const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
	return luminance < 140
}

// What the effects of the renderer read. The two accents come from the
// first colors the user has, and text-like draws contrast the stage.
export const buildEnginePalette = (background: string): PaletteT => {
	const accentOne = findColor(ACCENT_ONE_COLOR_ID) ?? palette.colors[0]
	const accentTwo = findColor(ACCENT_TWO_COLOR_ID) ?? palette.colors[1] ?? accentOne
	const colors: Record<string, string> = {}
	for (const color of palette.colors) colors[color.id] = color.value
	return {
		accent1: accentOne?.value ?? FALLBACK_COLOR,
		accent2: accentTwo?.value ?? FALLBACK_COLOR,
		background,
		foreground: checkIsDark(background) ? '#ffffff' : '#000000',
		colors
	}
}
