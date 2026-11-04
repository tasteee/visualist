<script lang="ts">
	import type { Snippet } from 'svelte'
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon'
	import EyeIcon from 'phosphor-svelte/lib/EyeIcon'
	import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlashIcon'
	import SlidersHorizontalIcon from 'phosphor-svelte/lib/SlidersHorizontalIcon'
	import ImageIcon from 'phosphor-svelte/lib/ImageIcon'
	import PenNibIcon from 'phosphor-svelte/lib/PenNibIcon'
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon'
	import SparkleIcon from 'phosphor-svelte/lib/SparkleIcon'
	import TextTIcon from 'phosphor-svelte/lib/TextTIcon'
	import { checkIsTimeVisible, timeToPercent, timeToRatio } from '../engine/timeline'
	import type { GridLineT, TimelineGridT } from '../engine/timeline'
	import { PATH_WIDTH } from '../engine/automation'
	import type { LayerKindT } from '../engine/types'
	import { app } from '../store.svelte'
	import { timeline } from '../timeline.svelte'
	import './LaneGroup.css'

	// One header row in the timeline: the global settings, or a
	// layer. Its lanes render below it when it is open.
	type LaneGroupPropsT = {
		kind: 'global' | LayerKindT
		title: string
		detail: string
		grid: TimelineGridT
		isCollapsed: boolean
		isSelected?: boolean
		isHidden?: boolean
		canAddLane: boolean
		ontoggle: () => void
		onadd: () => void
		onselect?: () => void
		ontogglevisible?: () => void
		// Layer groups can be dragged by their name to reorder,
		// or moved with Alt+Up and Alt+Down.
		layerId?: string
		isDragSource?: boolean
		dropEdge?: 'before' | 'after' | null
		onreorderstart?: (event: PointerEvent) => void
		onreorderkey?: (direction: 'forward' | 'backward') => void
		track?: Snippet
	}

	const props: LaneGroupPropsT = $props()

	const view = $derived(timeline.view)
	const isLayer = $derived(props.kind !== 'global')
	const isGlobal = $derived(props.kind === 'global')
	const isLogo = $derived(props.kind === 'logo')
	const isText = $derived(props.kind === 'text')
	const isImage = $derived(props.kind === 'image')
	const isSvg = $derived(props.kind === 'svg')
	const canSelect = $derived(props.onselect !== undefined)
	const canToggleVisible = $derived(props.ontogglevisible !== undefined)
	const collapseLabel = $derived(props.isCollapsed ? `Show ${props.title} lanes` : `Hide ${props.title} lanes`)
	const addLabel = $derived(props.canAddLane ? `Add a lane to ${props.title}` : `Every ${props.title} control has a lane`)
	const visibilityLabel = $derived(props.isHidden ? `Show ${props.title}` : `Hide ${props.title}`)
	const barLines = $derived(props.grid.lines.filter((line) => line.kind === 'label' || line.kind === 'bar'))
	const playheadPercent = $derived(timeToPercent(app.currentTime, view))
	const isPlayheadVisible = $derived(checkIsTimeVisible(app.currentTime, view))

	const getGridX = (line: GridLineT): number => timeToRatio(line.time, view) * PATH_WIDTH

	const canReorder = $derived(props.onreorderstart !== undefined)
	const isDropBefore = $derived(props.dropEdge === 'before')
	const isDropAfter = $derived(props.dropEdge === 'after')
	const titleLabel = $derived(canReorder ? `Edit ${props.title}. Drag to reorder, or press Alt with an arrow key.` : `Edit ${props.title}`)

	const handleSelect = () => props.onselect?.()

	const handleTitleDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		props.onreorderstart?.(event)
	}

	// Up moves toward the front, which sits higher in the list.
	const handleTitleKey = (event: KeyboardEvent) => {
		if (!event.altKey) return
		const isUp = event.key === 'ArrowUp'
		const isDown = event.key === 'ArrowDown'
		if (!isUp && !isDown) return
		event.preventDefault()
		const direction = isUp ? 'forward' : 'backward'
		props.onreorderkey?.(direction)
	}

</script>

<div
	class="lane-group"
	class:isSelected={props.isSelected}
	class:isHidden={props.isHidden}
	class:isLayer
	class:isCollapsed={props.isCollapsed}
	class:isDragSource={props.isDragSource}
	class:isDropBefore
	class:isDropAfter
	data-layer-group={props.layerId}
>
	<div class="lane-group-header">
		<button class="lane-group-caret" type="button" aria-expanded={!props.isCollapsed} aria-label={collapseLabel} onclick={props.ontoggle}>
			<CaretRightIcon weight="bold" />
		</button>

		<button
			class="lane-group-title"
			class:canSelect
			class:canReorder
			type="button"
			disabled={!canSelect}
			aria-label={titleLabel}
			onclick={handleSelect}
			onpointerdown={handleTitleDown}
			onkeydown={handleTitleKey}
		>
			<span class="lane-group-icon" aria-hidden="true">
				{#if isGlobal}
					<SlidersHorizontalIcon weight="bold" />
				{/if}
				{#if isLogo}
					<SparkleIcon weight="fill" />
				{/if}
				{#if isText}
					<TextTIcon weight="bold" />
				{/if}
				{#if isImage}
					<ImageIcon weight="bold" />
				{/if}
				{#if isSvg}
					<PenNibIcon weight="bold" />
				{/if}
			</span>
			<span class="lane-group-text">
				<span class="lane-group-name">{props.title}</span>
				<span class="lane-group-detail">{props.detail}</span>
			</span>
		</button>

		<div class="lane-group-actions">
			{#if canToggleVisible}
				<z-tooltip content={visibilityLabel} placement="top" openDelay={300}>
					<button class="lane-group-action" type="button" aria-label={visibilityLabel} aria-pressed={props.isHidden} onclick={props.ontogglevisible}>
						{#if props.isHidden}
							<EyeSlashIcon weight="bold" />
						{/if}
						{#if !props.isHidden}
							<EyeIcon weight="bold" />
						{/if}
					</button>
				</z-tooltip>
			{/if}
			<z-tooltip content={addLabel} placement="top" openDelay={300}>
				<button class="lane-group-action" type="button" aria-label={addLabel} disabled={!props.canAddLane} onclick={props.onadd}>
					<PlusIcon weight="bold" />
				</button>
			</z-tooltip>
		</div>
	</div>

	<div class="lane-group-track" data-track="group">
		<svg class="lane-group-grid" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
			{#each barLines as line (line.time)}
				<line class="lane-group-gridline" class:isLabel={line.kind === 'label'} x1={getGridX(line)} x2={getGridX(line)} y1="0" y2="100" />
			{/each}
		</svg>
		{#if props.track}
			{@render props.track()}
		{/if}
		{#if isPlayheadVisible}
			<div class="lane-group-playhead" style:--group-x="{playheadPercent}%"></div>
		{/if}
	</div>
</div>
