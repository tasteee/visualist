// The inspector popover. One at most, anchored to the header
// that opened it. It holds the controls a row owns: its name,
// color and everything the sidebar used to show for it.
export type InspectorRowKindT = 'layer' | 'lane' | 'impulse' | 'band' | 'audio' | 'global'

export type InspectorAnchorT = {
	left: number
	top: number
	right: number
	bottom: number
}

export type RowInspectorT = {
	kind: InspectorRowKindT
	rowId: string
	anchor: InspectorAnchorT
}

type RowInspectorStateT = {
	open: RowInspectorT | null
}

export const rowInspector = $state<RowInspectorStateT>({ open: null })

export const openRowInspector = (kind: InspectorRowKindT, rowId: string, anchorElement: HTMLElement): void => {
	const bounds = anchorElement.getBoundingClientRect()
	const anchor = { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom }
	rowInspector.open = { kind, rowId, anchor }
}

export const closeRowInspector = (): void => {
	rowInspector.open = null
}
