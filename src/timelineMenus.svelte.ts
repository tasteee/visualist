// The grid menu the timeline opens, placed in viewport
// coordinates where it was opened.

export type GridMenuT = {
	x: number
	y: number
}

type TimelineMenusStateT = {
	grid: GridMenuT | null
}

export const timelineMenus = $state<TimelineMenusStateT>({ grid: null })

export const openGridMenu = (x: number, y: number): void => {
	timelineMenus.grid = { x, y }
}

export const closeTimelineMenus = (): void => {
	timelineMenus.grid = null
}
