<script lang="ts">
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon'
	import { GRID_DIVISIONS, formatGridDivision } from '../engine/timeline'
	import type { GridDivisionT } from '../engine/timeline'
	import { setGridDivision, timeline, toggleSnapping, toggleTriplet } from '../timeline.svelte'
	import { closeTimelineMenus as closeMenus, timelineMenus } from '../timelineMenus.svelte'
	import { focusShell } from './focus'
	import './TimelineMenus.css'

	// The grid menu, placed where it was opened
	// and kept inside the window.
	const MENU_MARGIN = 8

	let gridRoot = $state<HTMLDivElement | undefined>(undefined)

	const gridMenu = $derived(timelineMenus.grid)

	// A closed menu hands focus back to the editor.
	const closeTimelineMenus = () => {
		closeMenus()
		focusShell()
	}

	const getDivisionLabel = (division: GridDivisionT): string => {
		const isAuto = division === 'auto'
		if (isAuto) return 'Auto · follows zoom'
		return formatGridDivision(division)
	}

	const checkIsDivisionActive = (division: GridDivisionT): boolean => timeline.gridDivision === division

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
		void gridMenu
		keepInWindow(gridRoot)
	})

	$effect(() => {
		const isOpen = gridMenu !== null
		if (!isOpen) return
		const handlePointerDown = (event: PointerEvent) => {
			const path = event.composedPath()
			const isInGrid = gridRoot instanceof HTMLElement && path.includes(gridRoot)
			if (isInGrid) return
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
