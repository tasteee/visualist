<script lang="ts">
	import type { Snippet } from 'svelte'
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon'
	import EyeIcon from 'phosphor-svelte/lib/EyeIcon'
	import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlashIcon'
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon'
	import { PATH_WIDTH } from '../engine/automation'
	import type { ColorNameT } from '../engine/palette'
	import { checkIsTimeVisible, timeToPercent, timeToRatio } from '../engine/timeline'
	import type { GridLineT, TimelineGridT } from '../engine/timeline'
	import type { LayerKindT } from '../engine/types'
	import { clamp } from '../engine/settings'
	import { ratioToTime, snapToGrid } from '../engine/timeline'
	import { app, seekTo } from '../store.svelte'
	import { timeline } from '../timeline.svelte'
	import type { RowRefT } from '../rowLayout.svelte'
	import { openRowInspector } from '../rowInspector.svelte'
	import type { InspectorRowKindT } from '../rowInspector.svelte'
	import { rowHeader } from './rowHeader'
	import './TimelineLayer.css'

	// One layer in the timeline: the audio, the scene settings,
	// or a visual layer. Its automation lanes render below it
	// when it is open.
	type TimelineLayerPropsT = {
		kind: LayerKindT
		rowId: string
		color: ColorNameT
		title: string
		grid: TimelineGridT
		isCollapsed: boolean
		isSelected?: boolean
		isHidden?: boolean
		canAddLane: boolean
		addLabel?: string
		ontoggle: (event: MouseEvent) => void
		onadd: () => void
		// A click on the header away from its controls.
		onselect?: (event: PointerEvent) => void
		// The rows that follow along with the primary modifier.
		siblings?: RowRefT[]
		ontogglevisible?: () => void
		// Visual layers can be dragged by their name to reorder,
		// or moved with Alt+Up and Alt+Down.
		layerId?: string
		isDragSource?: boolean
		dropEdge?: 'before' | 'after' | null
		onreorderstart?: (event: PointerEvent) => void
		onreorderkey?: (direction: 'forward' | 'backward') => void
		track?: Snippet
	}

	const props: TimelineLayerPropsT = $props()

	const view = $derived(timeline.view)
	const isAudio = $derived(props.kind === 'audio')
	const canToggleVisible = $derived(props.ontogglevisible !== undefined)
	const collapseLabel = $derived(props.isCollapsed ? `Show ${props.title} automations` : `Hide ${props.title} automations`)
	const defaultAddLabel = $derived(props.canAddLane ? `Automate a ${props.title} control` : `Every ${props.title} control is automated`)
	const addLabel = $derived(props.addLabel ?? defaultAddLabel)
	const visibilityLabel = $derived(props.isHidden ? `Show ${props.title}` : `Hide ${props.title}`)
	// Every line the ruler draws, so what a click snaps to is visible.
	const gridLines = $derived(props.grid.lines)
	const playheadPercent = $derived(timeToPercent(app.currentTime, view))
	const isPlayheadVisible = $derived(checkIsTimeVisible(app.currentTime, view))
	const row = $derived<RowRefT>({ kind: 'layer', id: props.rowId })
	const siblingRows = $derived(props.siblings ?? [])
	const inspectorKind: InspectorRowKindT = 'layer'

	const getGridX = (line: GridLineT): number => timeToRatio(line.time, view) * PATH_WIDTH

	const canReorder = $derived(props.onreorderstart !== undefined)
	const isDropBefore = $derived(props.dropEdge === 'before')
	const isDropAfter = $derived(props.dropEdge === 'after')

	// A click on empty space in a layer's row sets the playhead there.
	// Clips and their handles keep their own clicks.
	const handleTrackClick = (event: MouseEvent) => {
		const target = event.target as Element
		const isOnClip = target.closest('.layer-clip, .audio-clip, [data-clip-control]') !== null
		if (isOnClip) return
		const bounds = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null
		if (bounds === null) return
		const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
		const rawTime = clamp(ratioToTime(ratio, view), 0, app.duration)
		const shouldSnap = timeline.isSnapping && !event.shiftKey
		seekTo(shouldSnap ? snapToGrid(rawTime, props.grid) : rawTime)
	}

	const handleInspect = (anchor: HTMLElement) => openRowInspector(inspectorKind, props.rowId, anchor)

	const handleReorder = (event: PointerEvent) => props.onreorderstart?.(event)

	// Up moves toward the front, which sits higher in the list.
	const handleHeaderKey = (event: KeyboardEvent) => {
		if (!event.altKey) return
		const isUp = event.key === 'ArrowUp'
		const isDown = event.key === 'ArrowDown'
		if (!isUp && !isDown) return
		event.preventDefault()
		const direction = isUp ? 'forward' : 'backward'
		props.onreorderkey?.(direction)
	}

	const headerOptions = $derived({
		row,
		getSiblings: () => siblingRows,
		canResize: false,
		onselect: props.onselect,
		onreorder: canReorder ? handleReorder : undefined,
		oninspect: handleInspect
	})
</script>

<div
	class="timeline-layer"
	class:isSelected={props.isSelected}
	class:isHidden={props.isHidden}
	class:isAudio
	class:isCollapsed={props.isCollapsed}
	class:isDragSource={props.isDragSource}
	class:isDropBefore
	class:isDropAfter
	data-layer-group={props.layerId}
	data-tone={props.color}
>
	<div class="timeline-layer-header" class:canReorder role="presentation" use:rowHeader={headerOptions} onkeydown={handleHeaderKey}>
		<button class="timeline-layer-caret" type="button" aria-expanded={!props.isCollapsed} aria-label={collapseLabel} onclick={props.ontoggle}>
			<CaretRightIcon weight="bold" />
		</button>

		{#if canToggleVisible}
			<z-tooltip content={visibilityLabel} placement="top" openDelay={300}>
				<button class="timeline-layer-action" type="button" aria-label={visibilityLabel} aria-pressed={props.isHidden} onclick={props.ontogglevisible}>
					{#if props.isHidden}
						<EyeSlashIcon weight="bold" />
					{/if}
					{#if !props.isHidden}
						<EyeIcon weight="bold" />
					{/if}
				</button>
			</z-tooltip>
		{/if}

		<span class="timeline-layer-name">{props.title}</span>

		<z-tooltip content={addLabel} placement="top" openDelay={300}>
			<button class="timeline-layer-action" type="button" aria-label={addLabel} disabled={!props.canAddLane} onclick={props.onadd}>
				<PlusIcon weight="bold" />
			</button>
		</z-tooltip>
	</div>

	<div class="timeline-layer-track" data-track="layer" role="presentation" onclick={handleTrackClick}>
		<svg class="timeline-layer-grid" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
			{#each gridLines as line (line.time)}
				<line class="timeline-layer-gridline" class:isLabel={line.kind === 'label'} class:isSub={line.kind === 'sub'} x1={getGridX(line)} x2={getGridX(line)} y1="0" y2="100" />
			{/each}
		</svg>
		{#if props.track}
			{@render props.track()}
		{/if}
		{#if isPlayheadVisible}
			<div class="timeline-layer-playhead" style:--layer-x="{playheadPercent}%"></div>
		{/if}
	</div>

</div>
