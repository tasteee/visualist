<script lang="ts">
	import type { ColorNameT } from '../engine/palette'
	import { openColorMenu } from '../timelineMenus.svelte'
	import './ColorDot.css'

	// A row's color, as a dot. Clicking it opens the palette.
	type ColorDotPropsT = {
		rowId: string
		color: ColorNameT
		label: string
		isSquare?: boolean
	}

	const props: ColorDotPropsT = $props()

	const handleClick = (event: MouseEvent) => {
		event.stopPropagation()
		const anchor = event.currentTarget as HTMLElement
		openColorMenu(props.rowId, props.color, anchor)
	}

	const handlePointerDown = (event: PointerEvent) => {
		event.stopPropagation()
	}
</script>

<button
	class="color-dot"
	class:isSquare={props.isSquare}
	type="button"
	data-tone={props.color}
	aria-label="Color of {props.label}"
	title="Change color"
	onclick={handleClick}
	onpointerdown={handlePointerDown}
></button>
