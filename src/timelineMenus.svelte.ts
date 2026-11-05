import type { ColorNameT } from './engine/palette'

// The small menus the timeline opens: a row's color palette
// and the grid menu. One of each at most, placed in viewport
// coordinates where they were opened.

export type ColorMenuT = {
	rowId: string
	color: ColorNameT
	x: number
	y: number
}

export type GridMenuT = {
	x: number
	y: number
}

type TimelineMenusStateT = {
	color: ColorMenuT | null
	grid: GridMenuT | null
}

export const timelineMenus = $state<TimelineMenusStateT>({ color: null, grid: null })

// The palette opens just under the dot that was clicked.
export const openColorMenu = (rowId: string, color: ColorNameT, anchor: HTMLElement): void => {
	const bounds = anchor.getBoundingClientRect()
	timelineMenus.grid = null
	timelineMenus.color = { rowId, color, x: bounds.left, y: bounds.bottom }
}

export const openGridMenu = (x: number, y: number): void => {
	timelineMenus.color = null
	timelineMenus.grid = { x, y }
}

export const closeTimelineMenus = (): void => {
	timelineMenus.color = null
	timelineMenus.grid = null
}
