<script lang="ts">
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon'
	import CubeIcon from 'phosphor-svelte/lib/CubeIcon'
	import ImageIcon from 'phosphor-svelte/lib/ImageIcon'
	import PulseIcon from 'phosphor-svelte/lib/PulseIcon'
	import SquareIcon from 'phosphor-svelte/lib/SquareIcon'
	import TextTIcon from 'phosphor-svelte/lib/TextTIcon'
	import VideoCameraIcon from 'phosphor-svelte/lib/VideoCameraIcon'
	import WaveformIcon from 'phosphor-svelte/lib/WaveformIcon'
	import { addImageLayer, addShapeLayer, addTextLayer } from '../layers.svelte'
	import { addEmptyTrack } from '../sources.svelte'
	import { openAddAudioPicker } from './filePicker'
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
	let addRoot = $state<HTMLDivElement | undefined>(undefined)

	const gridMenu = $derived(timelineMenus.grid)
	const addMenu = $derived(timelineMenus.addLayer)

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
		void addMenu
		keepInWindow(addRoot)
	})

	const handleAddAudio = () => {
		closeTimelineMenus()
		openAddAudioPicker()
	}

	const handleAddText = () => {
		addTextLayer()
		closeTimelineMenus()
	}

	const handleAddImage = () => {
		addImageLayer()
		closeTimelineMenus()
	}

	const handleAddShape = () => {
		addShapeLayer()
		closeTimelineMenus()
	}

	const handleAddImpulse = () => {
		addEmptyTrack()
		closeTimelineMenus()
	}

	$effect(() => {
		const isOpen = gridMenu !== null || addMenu !== null
		if (!isOpen) return
		const handlePointerDown = (event: PointerEvent) => {
			const path = event.composedPath()
			const isInGrid = gridRoot instanceof HTMLElement && path.includes(gridRoot)
			const isInAdd = addRoot instanceof HTMLElement && path.includes(addRoot)
			if (isInGrid || isInAdd) return
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

{#if addMenu !== null}
	<div class="timeline-menu" bind:this={addRoot} role="menu" aria-label="Add a layer" style:--menu-x="{addMenu.x}px" style:--menu-y="{addMenu.y}px">
		<span class="timeline-menu-eyebrow">Add a layer</span>
		<button class="timeline-menu-item" type="button" role="menuitem" onclick={handleAddAudio}>
			<span class="timeline-menu-check"><WaveformIcon weight="bold" /></span>
			Audio
		</button>
		<button class="timeline-menu-item" type="button" role="menuitem" onclick={handleAddText}>
			<span class="timeline-menu-check"><TextTIcon weight="bold" /></span>
			Text
		</button>
		<button class="timeline-menu-item" type="button" role="menuitem" onclick={handleAddImage}>
			<span class="timeline-menu-check"><ImageIcon weight="bold" /></span>
			Image
		</button>
		<button class="timeline-menu-item" type="button" role="menuitem" onclick={handleAddShape}>
			<span class="timeline-menu-check"><SquareIcon weight="bold" /></span>
			Shape
		</button>
		<button class="timeline-menu-item" type="button" role="menuitem" disabled>
			<span class="timeline-menu-check"><VideoCameraIcon weight="bold" /></span>
			Video
			<span class="timeline-menu-shortcut">Soon</span>
		</button>
		<button class="timeline-menu-item" type="button" role="menuitem" disabled>
			<span class="timeline-menu-check"><CubeIcon weight="bold" /></span>
			Model
			<span class="timeline-menu-shortcut">Soon</span>
		</button>
		<span class="timeline-menu-separator"></span>
		<button class="timeline-menu-item" type="button" role="menuitem" onclick={handleAddImpulse}>
			<span class="timeline-menu-check"><PulseIcon weight="bold" /></span>
			Impulse
		</button>
	</div>
{/if}
