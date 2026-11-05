import { getTargetTone } from './engine/automation'
import { checkIsColorName, getToneColor } from './engine/palette'
import type { ColorNameT } from './engine/palette'
import type { AutomationLaneT, LayerT } from './engine/types'

// How each timeline row looks: its color and its height. Rows
// are keyed by id: a layer, lane, hit track or band id, or the
// fixed ids of the audio and scene rows.

type AppearanceStateT = {
	colors: Record<string, ColorNameT>
	heights: Record<string, number>
}

const STORAGE_KEY = 'vink.appearance.v1'
export const AUDIO_ROW_ID = 'audio'
export const MIN_ROW_HEIGHT = 32
export const MAX_ROW_HEIGHT = 320

const readStored = (): AppearanceStateT => {
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY)
		if (stored === null) return { colors: {}, heights: {} }
		const parsed = JSON.parse(stored) as Partial<AppearanceStateT>
		const colors = Object.fromEntries(Object.entries(parsed.colors ?? {}).filter((entry) => checkIsColorName(entry[1])))
		const heights = Object.fromEntries(Object.entries(parsed.heights ?? {}).filter((entry) => typeof entry[1] === 'number'))
		return { colors: colors as Record<string, ColorNameT>, heights: heights as Record<string, number> }
	} catch {
		return { colors: {}, heights: {} }
	}
}

export const appearance = $state<AppearanceStateT>(readStored())

export const getRowColor = (rowId: string, fallback: ColorNameT): ColorNameT => appearance.colors[rowId] ?? fallback

// A lane's color: picked by the user, or its control's tone.
export const getLaneColor = (lane: AutomationLaneT, layers: LayerT[]): ColorNameT => {
	const toneColor = getToneColor(getTargetTone(lane.target, layers))
	return getRowColor(lane.id, toneColor)
}

export const setRowColor = (rowId: string, color: ColorNameT): void => {
	appearance.colors[rowId] = color
}

export const getRowHeight = (rowId: string): number | null => appearance.heights[rowId] ?? null

export const setRowHeight = (rowId: string, height: number): void => {
	const clamped = Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, Math.round(height)))
	appearance.heights[rowId] = clamped
}

export const resetRowHeight = (rowId: string): void => {
	delete appearance.heights[rowId]
}

// For a custom property: the stored height in px, or nothing,
// so the row falls back to its own default.
export const getRowHeightStyle = (rowId: string): string | undefined => {
	const height = getRowHeight(rowId)
	if (height === null) return undefined
	return `${height}px`
}

export const startAppearanceWatchers = (): void => {
	$effect.root(() => {
		$effect(() => {
			try {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify($state.snapshot(appearance)))
			} catch {
				return
			}
		})
	})
}
