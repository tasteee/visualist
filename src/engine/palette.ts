// The colors a timeline row can take, all drawn from the
// design system's tokens. tones.css maps each name to its
// token, so rows only ever carry the name.

export type ColorNameT = 'blue' | 'cyan' | 'mint' | 'green' | 'amber' | 'lime' | 'peach' | 'coral' | 'rose' | 'pink' | 'lavender'

export type ColorOptionT = {
	name: ColorNameT
	label: string
}

export const PALETTE: ColorOptionT[] = [
	{ name: 'blue', label: 'Blue' },
	{ name: 'cyan', label: 'Cyan' },
	{ name: 'mint', label: 'Mint' },
	{ name: 'green', label: 'Green' },
	{ name: 'amber', label: 'Amber' },
	{ name: 'lime', label: 'Lime' },
	// { name: 'peach', label: 'Peach' },
	{ name: 'coral', label: 'Coral' },
	{ name: 'rose', label: 'Rose' },
	{ name: 'pink', label: 'Pink' },
	{ name: 'lavender', label: 'Lavender' }
]

const COLOR_NAMES = PALETTE.map((option) => option.name)

export const checkIsColorName = (value: unknown): value is ColorNameT => {
	const isString = typeof value === 'string'
	if (!isString) return false
	return COLOR_NAMES.includes(value as ColorNameT)
}

// Automation tones 1-5, as the engine numbers them.
const TONE_COLORS: ColorNameT[] = ['lavender', 'pink', 'green', 'amber', 'cyan']

export const getToneColor = (tone: number): ColorNameT => {
	const index = Math.max(0, tone - 1) % TONE_COLORS.length
	return TONE_COLORS[index]
}

// A stable pick from an id, so a layer keeps its color when
// the stack is reordered.
export const pickColorForId = (id: string): ColorNameT => {
	let hash = 0
	for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
	return COLOR_NAMES[hash % COLOR_NAMES.length]
}

// An impulse track's default color follows what it drives.
export const getRoleColor = (role: 'none' | 'kick' | 'snare'): ColorNameT => {
	if (role === 'kick') return 'lavender'
	if (role === 'snare') return 'pink'
	return 'green'
}
