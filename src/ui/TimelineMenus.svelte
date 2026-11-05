<script lang="ts">
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon'
	import { setRowColor } from '../appearance.svelte'
	import { PALETTE } from '../engine/palette'
	import type { ColorNameT } from '../engine/palette'
	import { GRID_DIVISIONS, formatGridDivision } from '../engine/timeline'
	import type { GridDivisionT } from '../engine/timeline'
	import { setGridDivision, timeline, toggleSnapping, toggleTriplet } from '../timeline.svelte'
	import { closeTimelineMenus, timelineMenus } from '../timelineMenus.svelte'
	import './TimelineMenus.css'

	// The palette and grid menus, placed where they were opened
	// and kept inside the window.
	const MENU_MARGIN = 8

	let colorRoot = $state<HTMLDivElement | undefined>(undefined)
	let gridRoot = $state<HTMLDivElement | undefined>(undefined)

	const colorMenu = $derived(timelineMenus.color)
	const gridMenu = $derived(timelineMenus.grid)

	const getDivisionLabel = (division: GridDivisionT): string => {
		const isAuto = division === 'auto'
		if (isAuto) return 'Auto · follows zoom'
		return formatGridDivision(division)
	}

	const checkIsDivisionActive = (division: GridDivisionT): boolean => timeline.gridDivision === division

	const handleColorPick = (color: ColorNameT) => {
		if (colorMenu === null) return
		setRowColor(colorMenu.rowId, color)
		closeTimelineMenus()
	}

	const handleDivisionPick = (division: GridDivisionT) => {
		setGridDivision(division)
		closeTimelineMenus()
	}

	// Menus open at the pointer but shift back in when they would
	// spill past the window's edge.
	// A closed menu's element is gone, which bind:this reports as
	// null rather than undefined.
	const keepInWindow = (element: HTMLElement | null | undefined) => {
		const isMounted = element instanceof HTMLElement
		if (!isMounted) return
		const bounds = element.getBoundingClientRect()
		const overflowRight = bounds.right - (window.innerWidth - MENU_MARGIN)
		const overflowBottom = bounds.bottom - (window.innerHeight - MENU_MARGIN)
		const shiftX = Math.max(0, overflowRight)
		const shiftY = overflowBottom > 0 ? bounds.height + MENU_MARGIN : 0
		element.style.setProperty('--menu-shift-x', `${-shiftX}px`)
		element.style.setProperty('--menu-shift-y', `${-shiftY}px`)
	}

	$effect(() => {
		void colorMenu
		keepInWindow(colorRoot)
	})

	$effect(() => {
		void gridMenu
		keepInWindow(gridRoot)
	})

	$effect(() => {
		const isOpen = colorMenu !== null || gridMenu !== null
		if (!isOpen) return
		const handlePointerDown = (event: PointerEvent) => {
			const path = event.composedPath()
			const isInColor = colorRoot instanceof HTMLElement && path.includes(colorRoot)
			const isInGrid = gridRoot instanceof HTMLElement && path.includes(gridRoot)
			if (isInColor || isInGrid) return
			closeTimelineMenus()
		}
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') closeTimelineMenus()
		}
		window.addEventListener('pointerdown', handlePointerDown, true)
		window.addEventListener('keydown', handleKeyDown)
		return () => {
			window.removeEventListener('pointerdown', handlePointerDown, true)
			window.removeEventListener('keydown', handleKeyDown)
		}
	})
</script>

{#if colorMenu !== null}
	<div class="timeline-menu isPalette" bind:this={colorRoot} role="dialog" aria-label="Pick a color" style:--menu-x="{colorMenu.x}px" style:--menu-y="{colorMenu.y}px">
		<span class="timeline-menu-eyebrow">Color</span>
		<div class="timeline-menu-swatches">
			{#each PALETTE as option (option.name)}
				<button
					class="timeline-menu-swatch"
					class:isActive={colorMenu.color === option.name}
					type="button"
					data-tone={option.name}
					aria-label={option.label}
					aria-pressed={colorMenu.color === option.name}
					title={option.label}
					onclick={() => handleColorPick(option.name)}
				></button>
			{/each}
		</div>
	</div>
{/if}

{#if gridMenu !== null}
	<div class="timeline-menu" bind:this={gridRoot} role="menu" aria-label="Grid" style:--menu-x="{gridMenu.x}px" style:--menu-y="{gridMenu.y}px">
		<span class="timeline-menu-eyebrow">Grid</span>
		{#each GRID_DIVISIONS as division (division)}
			<button class="timeline-menu-item" type="button" role="menuitemradio" aria-checked={checkIsDivisionActive(division)} onclick={() => handleDivisionPick(division)}>
				<span class="timeline-menu-check">
					{#if checkIsDivisionActive(division)}
						<CheckIcon weight="bold" />
					{/if}
				</span>
				{getDivisionLabel(division)}
			</button>
		{/each}
		<span class="timeline-menu-separator"></span>
		<button class="timeline-menu-item" type="button" role="menuitemcheckbox" aria-checked={timeline.isTriplet} onclick={toggleTriplet}>
			<span class="timeline-menu-check">
				{#if timeline.isTriplet}
					<CheckIcon weight="bold" />
				{/if}
			</span>
			Triplets
		</button>
		<button class="timeline-menu-item" type="button" role="menuitemcheckbox" aria-checked={timeline.isSnapping} onclick={toggleSnapping}>
			<span class="timeline-menu-check">
				{#if timeline.isSnapping}
					<CheckIcon weight="bold" />
				{/if}
			</span>
			Snap to grid
			<span class="timeline-menu-shortcut">S</span>
		</button>
	</div>
{/if}
