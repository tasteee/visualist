<script lang="ts">
	import { getRowHeight, resetRowHeight, setRowHeight } from '../appearance.svelte'
	import './RowResizer.css'

	// A handle along the bottom edge of a timeline row. Drag it
	// to change the row's height. Double-click resets it.
	type RowResizerPropsT = {
		rowId: string
		label: string
	}

	type ResizeDragT = {
		startY: number
		startHeight: number
	}

	const props: RowResizerPropsT = $props()

	const KEY_STEP_PX = 8

	let drag: ResizeDragT | null = null

	const readRowHeight = (handle: HTMLElement): number => {
		const row = handle.parentElement
		if (row === null) return getRowHeight(props.rowId) ?? 0
		return row.getBoundingClientRect().height
	}

	const handleDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		event.stopPropagation()
		event.preventDefault()
		const handle = event.currentTarget as HTMLElement
		handle.setPointerCapture(event.pointerId)
		drag = { startY: event.clientY, startHeight: readRowHeight(handle) }
	}

	const handleMove = (event: PointerEvent) => {
		const activeDrag = drag
		if (activeDrag === null) return
		const travel = event.clientY - activeDrag.startY
		setRowHeight(props.rowId, activeDrag.startHeight + travel)
	}

	const handleUp = () => {
		drag = null
	}

	const handleReset = () => resetRowHeight(props.rowId)

	const handleKey = (event: KeyboardEvent) => {
		const directions: Partial<Record<string, number>> = { ArrowUp: -1, ArrowDown: 1 }
		const direction = directions[event.key] ?? 0
		const isArrow = direction !== 0
		if (!isArrow) return
		event.preventDefault()
		const handle = event.currentTarget as HTMLElement
		setRowHeight(props.rowId, readRowHeight(handle) + direction * KEY_STEP_PX)
	}
</script>

<button
	class="row-resizer"
	type="button"
	aria-label="Resize {props.label}. Use the arrow keys, or double-click to reset."
	title="Drag to resize · double-click to reset"
	onpointerdown={handleDown}
	onpointermove={handleMove}
	onpointerup={handleUp}
	onpointercancel={handleUp}
	ondblclick={handleReset}
	onkeydown={handleKey}
></button>
