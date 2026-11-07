// The grid menu the timeline opens, placed in viewport
// coordinates where it was opened.

export type GridMenuT = {
	x: number
	y: number
}

type TimelineMenusStateT = {
	grid: GridMenuT | null
	addLayer: GridMenuT | null
}

export const timelineMenus = $state<TimelineMenusStateT>({ grid: null, addLayer: null })

export const openGridMenu = (x: number, y: number): void => {
	timelineMenus.addLayer = null
	timelineMenus.grid = { x, y }
}

// The add-layer menu opens just under the plus that was pressed.
export const openAddLayerMenu = (anchor: HTMLElement): void => {
	const bounds = anchor.getBoundingClientRect()
	timelineMenus.grid = null
	timelineMenus.addLayer = { x: bounds.left, y: bounds.bottom + 4 }
}

export const closeTimelineMenus = (): void => {
	timelineMenus.grid = null
	timelineMenus.addLayer = null
}
