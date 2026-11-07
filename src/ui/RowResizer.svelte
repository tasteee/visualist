<script lang="ts">
	import { recordHistory } from '../automation.svelte'
	import { applyRowHeight, getRowDisplayHeight, nudgeRowHeight, resetRowLayout } from '../rowLayout.svelte'
	import type { RowKindT, RowRefT } from '../rowLayout.svelte'
	import './RowResizer.css'

	// A handle along the bottom edge of a timeline row. Drag it
	// to change the row's height, or past the minimum to fold it.
	// With the primary modifier, siblings follow. Double-click
	// resets.
	type RowResizerPropsT = {
		rowId: string
		kind: RowKindT
		label: string
		// The rows that follow along with the primary modifier.
		siblings: RowRefT[]
	}

	type ResizeDragT = {
		startY: number
		startHeight: number
		hasMoved: boolean
	}

	const props: RowResizerPropsT = $props()

	const KEY_STEP_PX = 8
	const DRAG_THRESHOLD_PX = 3

	let drag: ResizeDragT | null = null

	const row = $derived<RowRefT>({ kind: props.kind, id: props.rowId })

	const checkIsPrimaryModifier = (event: PointerEvent | KeyboardEvent): boolean => event.metaKey || event.ctrlKey

	const pickSiblings = (event: PointerEvent | KeyboardEvent): RowRefT[] => {
		const isPrimary = checkIsPrimaryModifier(event)
		if (!isPrimary) return []
		return props.siblings
	}

	const handleDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		event.stopPropagation()
		event.preventDefault()
		const handle = event.currentTarget as HTMLElement
		handle.setPointerCapture(event.pointerId)
		drag = { startY: event.clientY, startHeight: getRowDisplayHeight(row), hasMoved: false }
	}

	const handleMove = (event: PointerEvent) => {
		const activeDrag = drag
		if (activeDrag === null) return
		const travel = event.clientY - activeDrag.startY
		const isPastThreshold = Math.abs(travel) > DRAG_THRESHOLD_PX
		const shouldStart = activeDrag.hasMoved || isPastThreshold
		if (!shouldStart) return
		// One undo step per drag, recorded when it really moves.
		if (!activeDrag.hasMoved) recordHistory()
		activeDrag.hasMoved = true
		applyRowHeight(row, activeDrag.startHeight + travel, pickSiblings(event))
	}

	const handleUp = () => {
		drag = null
	}

	const handleReset = () => resetRowLayout(row)

	const handleKey = (event: KeyboardEvent) => {
		const directions: Partial<Record<string, number>> = { ArrowUp: -1, ArrowDown: 1 }
		const direction = directions[event.key] ?? 0
		const isArrow = direction !== 0
		if (!isArrow) return
		event.preventDefault()
		event.stopPropagation()
		nudgeRowHeight(row, direction * KEY_STEP_PX, pickSiblings(event))
	}
</script>

<button
	class="row-resizer"
	type="button"
	tabindex="-1"
	aria-label="Resize {props.label}. Use the arrow keys, or double-click to reset."
	title="Drag to resize or fold · double-click to reset"
	onpointerdown={handleDown}
	onpointermove={handleMove}
	onpointerup={handleUp}
	onpointercancel={handleUp}
	ondblclick={handleReset}
	onkeydown={handleKey}
></button>
