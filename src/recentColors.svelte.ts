// The last colors the user picked, newest first, kept between sessions.
// A color is a palette color's id or a #rrggbb of its own.
const STORAGE_KEY = 'vink.recentColors.v1'
const MAX_RECENT = 10

const load = (): string[] => {
	try {
		const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown
		if (!Array.isArray(parsed)) return []
		return parsed.filter((value): value is string => typeof value === 'string').slice(0, MAX_RECENT)
	} catch {
		return []
	}
}

export const recentColors = $state<{ values: string[] }>({ values: load() })

export const pushRecentColor = (value: string): void => {
	recentColors.values = [value, ...recentColors.values.filter((candidate) => candidate !== value)].slice(0, MAX_RECENT)
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recentColors.values))
	} catch {
		return
	}
}
