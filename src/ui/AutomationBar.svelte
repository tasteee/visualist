<script lang="ts">
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon'
	import { automation, addLane } from '../automation.svelte'
	import AutomationLane from './AutomationLane.svelte'
	import AutomationPopover from './AutomationPopover.svelte'
	import './AutomationBar.css'

	type PointEditorT = {
		laneId: string
		pointId: string
		anchorX: number
		anchorY: number
	}

	let bar: HTMLDivElement
	let editor = $state<PointEditorT | null>(null)

	const laneCount = $derived(automation.lanes.length)
	const hasLanes = $derived(laneCount > 0)
	const description = $derived(
		hasLanes
			? 'Click to add · Drag to move · Alt-drag to curve · Right-click to edit · Double-click to remove'
			: 'Automate any control over the length of the song'
	)

	const openEditor = (laneId: string, pointId: string, anchor: HTMLElement) => {
		const barBounds = bar.getBoundingClientRect()
		const anchorBounds = anchor.getBoundingClientRect()
		const anchorX = anchorBounds.left + anchorBounds.width / 2 - barBounds.left
		const anchorY = anchorBounds.top - barBounds.top
		editor = { laneId, pointId, anchorX, anchorY }
	}

	const closeEditor = () => {
		editor = null
	}
</script>

<div class="automation" bind:this={bar}>
	<div class="automation-header">
		<span class="automation-title">Automation</span>
		<span class="automation-description">{description}</span>
		<z-tooltip content="Add lane" placement="top">
			<z-button size="sm" kind="outline" tone="neutral" aria-label="Add automation lane" onclick={addLane}>
				<PlusIcon weight="bold" />
			</z-button>
		</z-tooltip>
	</div>

	{#if hasLanes}
		<div class="automation-lanes">
			{#each automation.lanes as lane (lane.id)}
				<AutomationLane {lane} onedit={openEditor} />
			{/each}
		</div>
	{/if}

	{#if editor !== null}
		<AutomationPopover
			laneId={editor.laneId}
			pointId={editor.pointId}
			anchorX={editor.anchorX}
			anchorY={editor.anchorY}
			onclose={closeEditor}
		/>
	{/if}
</div>
