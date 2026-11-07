import { checkIsPrimaryModifierHeld } from './focus'
import { nudgeRowHeight } from '../rowLayout.svelte'
import type { RowRefT } from '../rowLayout.svelte'

// What a header does besides hold its controls: a click away
// from them selects the row, a right-click opens the inspector,
// and a pinch changes the row's height.
export type RowHeaderOptionsT = {
	row: RowRefT
	getSiblings: () => RowRefT[]
	onselect?: (event: PointerEvent) => void
	onreorder?: (event: PointerEvent) => void
	oninspect: (anchor: HTMLElement) => void
}

const CONTROL_SELECTOR = 'button, input, select, textarea, a, z-select, z-input, z-slider, z-switch, z-button, [data-no-select]'

// A pinch of this many wheel pixels is one pixel of height.
const PINCH_HEIGHT_PER_WHEEL = 1.6

const checkIsOnControl = (target: EventTarget | null): boolean => {
	const isElement = target instanceof Element
	if (!isElement) return false
	return target.closest(CONTROL_SELECTOR) !== null
}

export const rowHeader = (node: HTMLElement, initialOptions: RowHeaderOptionsT) => {
	let options = initialOptions

	const handlePointerDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		const isOnControl = checkIsOnControl(event.target)
		if (isOnControl) return
		options.onselect?.(event)
		options.onreorder?.(event)
	}

	const handleContextMenu = (event: MouseEvent) => {
		event.preventDefault()
		event.stopPropagation()
		options.oninspect(node)
	}

	// Pinch out is a negative wheel delta with the control flag
	// the browser adds. It must not reach the plot's zoom.
	const handleWheel = (event: WheelEvent) => {
		const isPinch = event.ctrlKey || event.metaKey
		if (!isPinch) return
		event.preventDefault()
		event.stopPropagation()
		const deltaHeight = -event.deltaY * PINCH_HEIGHT_PER_WHEEL
		const siblings = checkIsPrimaryModifierHeld() ? options.getSiblings() : []
		nudgeRowHeight(options.row, deltaHeight, siblings)
	}

	node.addEventListener('pointerdown', handlePointerDown)
	node.addEventListener('contextmenu', handleContextMenu)
	node.addEventListener('wheel', handleWheel, { passive: false })

	return {
		update(nextOptions: RowHeaderOptionsT) {
			options = nextOptions
		},
		destroy() {
			node.removeEventListener('pointerdown', handlePointerDown)
			node.removeEventListener('contextmenu', handleContextMenu)
			node.removeEventListener('wheel', handleWheel)
		}
	}
}
