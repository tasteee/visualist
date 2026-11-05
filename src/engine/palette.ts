// The colors a timeline row can take, all drawn from the
// design system's tokens. tones.css maps each name to its
// token, so rows only ever carry the name.

export type ColorNameT = 'purple' | 'lavender' | 'pink' | 'blush' | 'red' | 'amber' | 'green' | 'silver' | 'slate'

export type ColorOptionT = {
	name: ColorNameT
	label: string
}

export const PALETTE: ColorOptionT[] = [
	{ name: 'purple', label: 'Purple' },
	{ name: 'lavender', label: 'Lavender' },
	{ name: 'pink', label: 'Pink' },
	{ name: 'blush', label: 'Blush' },
	{ name: 'red', label: 'Red' },
	{ name: 'amber', label: 'Amber' },
	{ name: 'green', label: 'Green' },
	{ name: 'silver', label: 'Silver' },
	{ name: 'slate', label: 'Slate' }
]

const COLOR_NAMES = PALETTE.map((option) => option.name)

export const checkIsColorName = (value: unknown): value is ColorNameT => {
	const isString = typeof value === 'string'
	if (!isString) return false
	return COLOR_NAMES.includes(value as ColorNameT)
}

// Automation tones 1-5, as the engine numbers them.
const TONE_COLORS: ColorNameT[] = ['purple', 'pink', 'green', 'amber', 'silver']

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

// A hit track's default color follows what it drives.
export const getRoleColor = (role: 'none' | 'kick' | 'snare'): ColorNameT => {
	if (role === 'kick') return 'purple'
	if (role === 'snare') return 'pink'
	return 'green'
}
