<script lang="ts">
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon'
	import { recordHistory } from '../automation.svelte'
	import { deleteImpulse, findTrack, moveImpulse } from '../sources.svelte'
	import { app } from '../store.svelte'
	import './AutomationPopover.css'

	// Right-click on an impulse: its time and strength, to type in.
	type ImpulsePopoverPropsT = {
		trackId: string
		impulseId: string
		anchorX: number
		anchorY: number
		onclose: () => void
	}

	const props: ImpulsePopoverPropsT = $props()

	const STRENGTH_STEP = 0.01
	const TIME_STEP = 0.1

	let root = $state<HTMLDivElement | undefined>(undefined)

	const track = $derived(findTrack(props.trackId))
	const impulse = $derived(track?.impulses.find((candidate) => candidate.id === props.impulseId))
	const isReady = $derived(track !== undefined && impulse !== undefined)

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

	const handleStrengthChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: number }>).detail
		if (impulse === undefined) return
		recordHistory()
		moveImpulse(props.trackId, props.impulseId, impulse.time, detail.value)
	}

	const handleTimeChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: number }>).detail
		if (impulse === undefined) return
		recordHistory()
		moveImpulse(props.trackId, props.impulseId, detail.value, impulse.strength)
	}

	const handleDelete = () => {
		deleteImpulse(props.trackId, props.impulseId)
		props.onclose()
	}
</script>

{#if isReady && impulse !== undefined && track !== undefined}
	<div class="automation-popover" bind:this={root} role="dialog" aria-label="Edit impulse" style:--popover-x="{props.anchorX}px" style:--popover-y="{props.anchorY}px">
		<div class="automation-popover-header">
			<span class="automation-popover-eyebrow">Impulse</span>
			<span class="automation-popover-title">{track.name}</span>
		</div>

		<div class="automation-popover-fields">
			<z-field label="Strength">
				<z-number-input value={Number(impulse.strength.toFixed(2))} min={0} max={1} step={STRENGTH_STEP} isFullWidth onchange={handleStrengthChange}></z-number-input>
			</z-field>
			<z-field label="Time (s)">
				<z-number-input value={Number(impulse.time.toFixed(2))} min={0} max={app.duration} step={TIME_STEP} isFullWidth onchange={handleTimeChange}></z-number-input>
			</z-field>
		</div>

		<z-button size="sm" kind="outline" tone="danger" isFullWidth onclick={handleDelete}>
			<TrashIcon weight="bold" />
			Delete impulse
		</z-button>
	</div>
{/if}
