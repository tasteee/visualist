<script lang="ts">
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon'
	import { automation, deletePoint, movePoint, recordHistory } from '../automation.svelte'
	import { getTargetControl, toControlValue, toNormalized } from '../engine/automation'
	import type { LayerT } from '../engine/types'
	import { layerStore } from '../layers.svelte'
	import { app } from '../store.svelte'
	import './AutomationPopover.css'

	type AutomationPopoverPropsT = {
		laneId: string
		pointId: string
		anchorX: number
		anchorY: number
		onclose: () => void
	}

	const props: AutomationPopoverPropsT = $props()

	let root = $state<HTMLDivElement | undefined>(undefined)

	const lane = $derived(automation.lanes.find((candidate) => candidate.id === props.laneId))
	const point = $derived(lane?.points.find((candidate) => candidate.id === props.pointId))
	const control = $derived(lane === undefined ? null : getTargetControl(lane.target, layerStore.layers as LayerT[]))
	const isReady = $derived(lane !== undefined && point !== undefined && control !== null)

	const controlValue = $derived(control === null || point === undefined ? 0 : Number(toControlValue(control, point.value).toFixed(2)))
	const title = $derived(control === null ? 'Point' : control.label)
	const valueMin = $derived(control === null ? 0 : control.min)
	const valueMax = $derived(control === null ? 1 : control.max)

	$effect(() => {
		if (!isReady) props.onclose()
	})

	$effect(() => {
		const handlePointerDown = (event: PointerEvent) => {
			const isInside = root !== undefined && event.composedPath().includes(root)
			if (!isInside) props.onclose()
		}
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') props.onclose()
		}
		window.addEventListener('pointerdown', handlePointerDown, true)
		window.addEventListener('keydown', handleKeyDown)
		return () => {
			window.removeEventListener('pointerdown', handlePointerDown, true)
			window.removeEventListener('keydown', handleKeyDown)
		}
	})

	const handleValueChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: number }>).detail
		if (control === null || point === undefined) return
		const normalized = toNormalized(control, detail.value)
		recordHistory()
		movePoint(props.laneId, props.pointId, point.time, normalized, app.duration)
	}

	const handleTimeChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: number }>).detail
		if (point === undefined) return
		recordHistory()
		movePoint(props.laneId, props.pointId, detail.value, point.value, app.duration)
	}

	const handleDelete = () => {
		deletePoint(props.laneId, props.pointId)
		props.onclose()
	}
</script>

{#if isReady && point !== undefined}
	<div
		class="automation-popover"
		bind:this={root}
		role="dialog"
		aria-label="Edit point"
		style:--popover-x="{props.anchorX}px"
		style:--popover-y="{props.anchorY}px"
	>
		<div class="automation-popover-header">
			<span class="automation-popover-eyebrow">Point</span>
			<span class="automation-popover-title">{title}</span>
		</div>

		<div class="automation-popover-fields">
			<z-field label="Value">
				<z-number-input value={controlValue} min={valueMin} max={valueMax} step={0.01} isFullWidth onchange={handleValueChange}></z-number-input>
			</z-field>
			<z-field label="Time (s)">
				<z-number-input value={Number(point.time.toFixed(2))} min={0} max={app.duration} step={0.1} isFullWidth onchange={handleTimeChange}></z-number-input>
			</z-field>
		</div>

		<z-button size="sm" kind="outline" tone="danger" isFullWidth onclick={handleDelete}>
			<TrashIcon weight="bold" />
			Delete point
		</z-button>
	</div>
{/if}
