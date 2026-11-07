<script lang="ts">
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon'
	import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon'
	import GridFourIcon from 'phosphor-svelte/lib/GridFourIcon'
	import RecordIcon from 'phosphor-svelte/lib/RecordIcon'
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon'
	import { getRowColor } from '../appearance.svelte'
	import { recordHistory } from '../automation.svelte'
	import { PATH_WIDTH } from '../engine/automation'
	import { formatImpulseCount, getRoleLabel } from '../engine/impulses'
	import { getRoleColor } from '../engine/palette'
	import { clamp } from '../engine/settings'
	import { getTrackSourceId } from '../engine/sources'
	import { checkIsTimeVisible, formatPreciseTime, getViewEnd, ratioToTime, snapToGrid, timeToPercent, timeToRatio } from '../engine/timeline'
	import type { GridLineT, TimelineGridT } from '../engine/timeline'
	import type { ImpulseTrackT, TrackImpulseT } from '../engine/types'
	import { addImpulse, armTrack, checkIsImpulseSelected, deleteImpulses, getSelectedImpulseCount, moveImpulses, removeTrack, sources } from '../sources.svelte'
	import type { ImpulseMoveT } from '../sources.svelte'
	import { openRowInspector } from '../rowInspector.svelte'
	import { checkIsRowFolded, getRowHeightCss, toggleRowFolded } from '../rowLayout.svelte'
	import type { RowRefT } from '../rowLayout.svelte'
	import { clearSelection as clearAllSelection, pickImpulse, pickImpulsesInBox, readModifiers, selectPlacedImpulse } from '../selection.svelte'
	import { app, getLiveSignals } from '../store.svelte'
	import { timeline } from '../timeline.svelte'
	import RowResizer from './RowResizer.svelte'
	import { rowHeader } from './rowHeader'
	import './ImpulseLane.css'

	type ImpulseLanePropsT = {
		track: ImpulseTrackT
		grid: TimelineGridT
		// The tracks in this lane's group, for the primary
		// modifier gestures.
		siblingTrackIds: string[]
		onpattern: (trackId: string, anchor: HTMLElement) => void
	}

	// Dragging moves every selected impulse together: time by the
	// grabbed impulse's snapped move, strength by the vertical travel.
	type GroupDragT = {
		anchorImpulseId: string
		anchorStartTime: number
		startX: number
		startY: number
		plotHeight: number
		starts: Map<string, TrackImpulseT>
		hasMoved: boolean
	}

	// A press on empty space: a click adds an impulse, a drag draws a
	// selection box.
	type MarqueeT = {
		startX: number
		startTime: number
		currentTime: number
		isAdditive: boolean
		isActive: boolean
		clickPosition: PlotPositionT
	}

	type PlotPositionT = {
		time: number
		strength: number
	}

	const props: ImpulseLanePropsT = $props()

	const FULL_STRENGTH = 1
	const DRAG_THRESHOLD_PX = 3

	let plot = $state<HTMLDivElement | undefined>(undefined)
	let drag = $state<GroupDragT | null>(null)
	let marquee = $state<MarqueeT | null>(null)
	let hoveredImpulseId = $state<string | null>(null)

	const view = $derived(timeline.view)
	const duration = $derived(app.duration)
	const impulses = $derived(props.track.impulses)
	const row = $derived<RowRefT>({ kind: 'impulse', id: props.track.id })
	const siblingRows = $derived(props.siblingTrackIds.filter((trackId) => trackId !== props.track.id).map((trackId): RowRefT => ({ kind: 'impulse', id: trackId })))
	const isCollapsed = $derived(checkIsRowFolded(row))
	// The header reads the strength of the latest impulse at or
	// before the playhead.
	const latestImpulse = $derived.by(() => {
		const earlier = impulses.filter((impulse) => impulse.time <= app.currentTime)
		return earlier[earlier.length - 1]
	})
	const latestLabel = $derived(latestImpulse === undefined ? '—' : latestImpulse.strength.toFixed(2))
	const isArmed = $derived(sources.armedTrackId === props.track.id)
	const isGate = $derived(props.track.shape === 'gate')
	const trackColor = $derived(getRowColor(props.track.id, getRoleColor(props.track.role)))
	const customHeight = $derived(getRowHeightCss(row))
	const impulseCountLabel = $derived(formatImpulseCount(impulses.length))
	const roleLabel = $derived(getRoleLabel(props.track.role))
	const hasRole = $derived(props.track.role !== 'none')
	// The role shows as the lane's color, and in full on hover.
	const metaTitle = $derived(hasRole ? `${impulseCountLabel} · ${roleLabel}` : impulseCountLabel)
	const selectedCount = $derived(getSelectedImpulseCount(props.track.id))
	const hasSelection = $derived(selectedCount > 0)
	const countLabel = $derived(hasSelection ? `${selectedCount} selected` : impulseCountLabel)
	const collapseLabel = $derived(isCollapsed ? `Expand ${props.track.name}` : `Fold ${props.track.name}`)
	const armLabel = $derived(isArmed ? 'Stop tapping' : 'Arm for tapping · press T while playing')
	const isEmpty = $derived(impulses.length === 0)
	const shouldShowHint = $derived(!isCollapsed && (isEmpty || isArmed || hasSelection))

	const buildHint = (): string => {
		if (isArmed) return 'Tapping · press T in time while the song plays'
		if (hasSelection) return 'Drag to move · Arrows nudge · Delete to remove · Esc clears'
		return 'Click to place an impulse · Drag across to select · Shift-click selects a range'
	}

	const hintText = $derived(buildHint())

	const sourceId = $derived(getTrackSourceId(props.track.id))
	const liveLevel = $derived(getLiveSignals()[sourceId] ?? 0)
	const liveStyle = $derived(`${(liveLevel * 100).toFixed(1)}%`)

	const gridLines = $derived(props.grid.lines)
	const playheadPercent = $derived(timeToPercent(app.currentTime, view))
	const isPlayheadVisible = $derived(checkIsTimeVisible(app.currentTime, view))
	const hoverTime = $derived(timeline.hoverTime)
	const hasHover = $derived(hoverTime !== null && checkIsTimeVisible(hoverTime, view))
	const hoverPercent = $derived(hoverTime === null ? 0 : timeToPercent(hoverTime, view))
	const trimStartPercent = $derived(clamp(timeToPercent(app.trimStart, view), 0, 100))
	const trimEndInset = $derived(clamp(100 - timeToPercent(app.trimEnd, view), 0, 100))

	// Impulses just outside the view stay rendered so a drag that
	// leaves the edge keeps its elements.
	const visibleImpulses = $derived.by(() => {
		const margin = view.span * 0.02
		const earliest = view.start - margin
		const latest = getViewEnd(view) + margin
		const draggingIds = drag === null ? null : drag.starts
		return impulses.filter((impulse) => {
			const isInWindow = impulse.time + impulse.length >= earliest && impulse.time <= latest
			const isDragging = draggingIds !== null && draggingIds.has(impulse.id)
			return isInWindow || isDragging
		})
	})

	const isMarqueeShown = $derived(marquee !== null && marquee.isActive)
	const marqueeStart = $derived(marquee === null ? 0 : Math.min(marquee.startTime, marquee.currentTime))
	const marqueeEnd = $derived(marquee === null ? 0 : Math.max(marquee.startTime, marquee.currentTime))
	const marqueeLeft = $derived(timeToPercent(marqueeStart, view))
	const marqueeWidth = $derived(timeToPercent(marqueeEnd, view) - marqueeLeft)

	const pillImpulseId = $derived(drag === null ? hoveredImpulseId : drag.anchorImpulseId)
	const pillImpulse = $derived(impulses.find((impulse) => impulse.id === pillImpulseId))
	const pillLabel = $derived(pillImpulse === undefined ? '' : `${Math.round(pillImpulse.strength * 100)}% · ${formatPreciseTime(pillImpulse.time)}`)

	const getGridX = (line: GridLineT): number => timeToRatio(line.time, view) * PATH_WIDTH

	const getImpulseX = (impulse: TrackImpulseT): number => timeToPercent(impulse.time, view)

	const getHoldWidth = (impulse: TrackImpulseT): number => (impulse.length / view.span) * 100

	const getImpulseHeight = (impulse: TrackImpulseT): number => impulse.strength * 100

	const checkIsSelected = (impulse: TrackImpulseT): boolean => checkIsImpulseSelected(props.track.id, impulse.id)

	const checkIsDragging = (impulse: TrackImpulseT): boolean => drag !== null && drag.hasMoved && drag.starts.has(impulse.id)

	// Only selected impulses are in the tab order, so a dense track
	// is not hundreds of tab stops.
	const getImpulseTabIndex = (impulse: TrackImpulseT): number => (checkIsSelected(impulse) ? 0 : -1)

	const describeImpulse = (impulse: TrackImpulseT): string => {
		const strength = Math.round(impulse.strength * 100)
		return `${props.track.name} impulse at ${formatPreciseTime(impulse.time)}, strength ${strength}%`
	}

	const readRawTime = (clientX: number): number => {
		if (plot === undefined) return 0
		const bounds = plot.getBoundingClientRect()
		const xRatio = clamp((clientX - bounds.left) / bounds.width, 0, 1)
		return clamp(ratioToTime(xRatio, view), 0, duration)
	}

	const snapTime = (time: number, event: PointerEvent): number => {
		const shouldSnap = timeline.isSnapping && !event.shiftKey
		if (!shouldSnap) return time
		return clamp(snapToGrid(time, props.grid), 0, duration)
	}

	const readSnappedTime = (event: PointerEvent): number => snapTime(readRawTime(event.clientX), event)

	const readImpulseId = (target: EventTarget | null): string | null => {
		const isElement = target instanceof Element
		if (!isElement) return null
		const element = target.closest<HTMLElement>('[data-impulse-id]')
		if (element === null) return null
		return element.dataset.impulseId ?? null
	}

	const findImpulse = (impulseId: string): TrackImpulseT | undefined => impulses.find((impulse) => impulse.id === impulseId)

	const getSelectedIds = (): string[] => {
		const isThisTrack = sources.impulseSelection.trackId === props.track.id
		if (!isThisTrack) return []
		return sources.impulseSelection.impulseIds
	}

	const captureStarts = (impulseIds: string[]): Map<string, TrackImpulseT> => {
		const starts = new Map<string, TrackImpulseT>()
		for (const impulseId of impulseIds) {
			const impulse = findImpulse(impulseId)
			if (impulse !== undefined) starts.set(impulseId, { ...impulse })
		}
		return starts
	}

	const startGroupDrag = (event: PointerEvent, impulse: TrackImpulseT) => {
		if (plot === undefined) return
		const isAlreadySelected = checkIsSelected(impulse)
		if (!isAlreadySelected) pickImpulse(props.track.id, impulse.id, { isRange: false, isToggle: false })
		const track = event.currentTarget as HTMLElement
		track.setPointerCapture(event.pointerId)
		const bounds = plot.getBoundingClientRect()
		drag = {
			anchorImpulseId: impulse.id,
			anchorStartTime: impulse.time,
			startX: event.clientX,
			startY: event.clientY,
			plotHeight: bounds.height,
			starts: captureStarts(getSelectedIds()),
			hasMoved: false
		}
	}

	// Alt-click and double-click take out the whole selection
	// when the impulse is part of it, or just that impulse.
	const deleteFromImpulse = (impulseId: string) => {
		const isInSelection = checkIsImpulseSelected(props.track.id, impulseId)
		const doomedIds = isInSelection ? getSelectedIds() : [impulseId]
		deleteImpulses(props.track.id, doomedIds)
	}

	const handleImpulseDown = (event: PointerEvent, impulseId: string) => {
		const impulse = findImpulse(impulseId)
		if (impulse === undefined) return
		if (event.altKey) return deleteFromImpulse(impulseId)
		const modifiers = readModifiers(event)
		const isPicking = modifiers.isRange || modifiers.isToggle
		if (isPicking) return pickImpulse(props.track.id, impulseId, modifiers)
		startGroupDrag(event, impulse)
	}

	const startMarquee = (event: PointerEvent) => {
		const track = event.currentTarget as HTMLElement
		track.setPointerCapture(event.pointerId)
		const startTime = readRawTime(event.clientX)
		marquee = {
			startX: event.clientX,
			startTime,
			currentTime: startTime,
			isAdditive: event.shiftKey,
			isActive: false,
			clickPosition: { time: readSnappedTime(event), strength: FULL_STRENGTH }
		}
	}

	const handleTrackDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		const canEdit = duration > 0 && !isCollapsed
		if (!isPrimaryButton || !canEdit) return
		const impulseId = readImpulseId(event.target)
		const isOnImpulse = impulseId !== null
		if (isOnImpulse) return handleImpulseDown(event, impulseId)
		startMarquee(event)
	}

	const checkIsPastThreshold = (dx: number, dy: number): boolean => {
		return Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX
	}

	const buildMoves = (activeDrag: GroupDragT, timeDelta: number, strengthDelta: number): ImpulseMoveT[] => {
		return Array.from(activeDrag.starts.values()).map((start) => ({
			impulseId: start.id,
			time: start.time + timeDelta,
			strength: start.strength + strengthDelta
		}))
	}

	// One undo step per drag, recorded when it really moves.
	const moveGroup = (event: PointerEvent, activeDrag: GroupDragT) => {
		const dx = event.clientX - activeDrag.startX
		const dy = event.clientY - activeDrag.startY
		const hasStartedMoving = activeDrag.hasMoved || checkIsPastThreshold(dx, dy)
		if (!hasStartedMoving) return
		if (!activeDrag.hasMoved) recordHistory()
		activeDrag.hasMoved = true
		const snappedTime = readSnappedTime(event)
		const timeDelta = snappedTime - activeDrag.anchorStartTime
		const strengthDelta = -dy / activeDrag.plotHeight
		moveImpulses(props.track.id, buildMoves(activeDrag, timeDelta, strengthDelta))
	}

	const moveMarquee = (event: PointerEvent, activeMarquee: MarqueeT) => {
		const dx = event.clientX - activeMarquee.startX
		const isNowActive = activeMarquee.isActive || checkIsPastThreshold(dx, 0)
		activeMarquee.isActive = isNowActive
		activeMarquee.currentTime = readRawTime(event.clientX)
	}

	const handleTrackMove = (event: PointerEvent) => {
		const activeDrag = drag
		if (activeDrag !== null) return moveGroup(event, activeDrag)
		const activeMarquee = marquee
		if (activeMarquee !== null) moveMarquee(event, activeMarquee)
	}

	const finishMarquee = (activeMarquee: MarqueeT) => {
		const startTime = Math.min(activeMarquee.startTime, activeMarquee.currentTime)
		const endTime = Math.max(activeMarquee.startTime, activeMarquee.currentTime)
		const boxedImpulses = impulses.filter((impulse) => impulse.time >= startTime && impulse.time <= endTime)
		const boxedIds = boxedImpulses.map((impulse) => impulse.id)
		pickImpulsesInBox(props.track.id, boxedIds, activeMarquee.isAdditive)
	}

	// The strength of the impulse before the new one, or full
	// strength when there is none. The pointer's height does not
	// set it.
	const getStrengthForNewImpulse = (time: number): number => {
		const earlierImpulses = impulses.filter((impulse) => impulse.time <= time)
		const previous = earlierImpulses[earlierImpulses.length - 1]
		const hasPrevious = previous !== undefined
		return hasPrevious ? previous.strength : FULL_STRENGTH
	}

	// A click on empty space places an impulse on button-up.
	const placeImpulse = (activeMarquee: MarqueeT) => {
		const time = activeMarquee.clickPosition.time
		const strength = getStrengthForNewImpulse(time)
		const holdLength = isGate ? props.grid.snapStep : 0
		const impulseId = addImpulse(props.track.id, time, strength, holdLength)
		if (impulseId === null) return
		selectPlacedImpulse(props.track.id, impulseId)
	}

	const handleTrackUp = () => {
		const activeDrag = drag
		const activeMarquee = marquee
		drag = null
		marquee = null
		const wasClickOnImpulse = activeDrag !== null && !activeDrag.hasMoved
		if (wasClickOnImpulse) return pickImpulse(props.track.id, activeDrag.anchorImpulseId, { isRange: false, isToggle: false })
		if (activeMarquee === null) return
		if (activeMarquee.isActive) return finishMarquee(activeMarquee)
		placeImpulse(activeMarquee)
	}

	const handleTrackCancel = () => {
		drag = null
		marquee = null
	}

	const handleTrackDoubleClick = (event: MouseEvent) => {
		if (isCollapsed) return toggleRowFolded(row, [])
		const impulseId = readImpulseId(event.target)
		if (impulseId === null) return
		deleteFromImpulse(impulseId)
	}

	let header: HTMLDivElement

	// The caret folds the row. It does not select or deselect.
	const handleToggle = (event: MouseEvent) => {
		const siblings = event.metaKey || event.ctrlKey ? siblingRows : []
		toggleRowFolded(row, siblings)
	}

	const handleArm = () => {
		const nextArmed = isArmed ? null : props.track.id
		armTrack(nextArmed)
	}

	const handlePattern = (event: MouseEvent) => {
		const anchor = event.currentTarget as HTMLElement
		props.onpattern(props.track.id, anchor)
	}

	const handleRemove = () => removeTrack(props.track.id)

	const handleSelectRow = () => {
		// An impulse lane is a row, not a selectable item, so a
		// click on its header only drops other selections.
		clearAllSelection()
	}

	const handleInspect = (anchor: HTMLElement) => openRowInspector('impulse', props.track.id, anchor)

	const handleSettings = () => openRowInspector('impulse', props.track.id, header)

	const headerOptions = $derived({
		row,
		getSiblings: () => siblingRows,
		onselect: handleSelectRow,
		oninspect: handleInspect
	})
</script>

<div class="impulse-lane" class:isCollapsed class:isArmed class:hasSelection data-tone={trackColor} style:--impulse-lane-custom-height={customHeight}>
	<div class="impulse-lane-header" role="presentation" bind:this={header} use:rowHeader={headerOptions}>
		<div class="impulse-lane-title">
			<button class="impulse-lane-caret" type="button" aria-expanded={!isCollapsed} aria-label={collapseLabel} onclick={handleToggle}>
				<CaretRightIcon weight="bold" />
			</button>
			<span class="impulse-lane-name">{props.track.name}</span>
			<span class="impulse-lane-value">{latestLabel}</span>
			{#if !isCollapsed}
				<div class="impulse-lane-actions">
					<z-tooltip content={armLabel} placement="top">
						<button class="impulse-lane-action isRecord" class:isOn={isArmed} type="button" aria-label={armLabel} aria-pressed={isArmed} onclick={handleArm}>
							<RecordIcon weight="fill" />
						</button>
					</z-tooltip>
					<z-tooltip content="Paint a step pattern" placement="top">
						<button class="impulse-lane-action" type="button" aria-label="Paint a step pattern" onclick={handlePattern}>
							<GridFourIcon weight="bold" />
						</button>
					</z-tooltip>
					<z-tooltip content="Lane settings" placement="top">
						<button class="impulse-lane-action" type="button" aria-label="Lane settings" onclick={handleSettings}>
							<GearSixIcon weight="bold" />
						</button>
					</z-tooltip>
					<z-tooltip content="Remove track" placement="top">
						<button class="impulse-lane-action isDanger" type="button" aria-label="Remove track" onclick={handleRemove}>
							<TrashIcon weight="bold" />
						</button>
					</z-tooltip>
				</div>
			{/if}
		</div>

	</div>

	<div
		class="impulse-lane-track"
		data-track="lane"
		role="group"
		aria-label="{props.track.name} impulses"
		onpointerdown={handleTrackDown}
		onpointermove={handleTrackMove}
		onpointerup={handleTrackUp}
		onpointercancel={handleTrackCancel}
		ondblclick={handleTrackDoubleClick}
	>
		<svg class="impulse-lane-grid" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
			{#each gridLines as line (line.time)}
				<line
					class="impulse-lane-gridline"
					class:isLabel={line.kind === 'label'}
					class:isBar={line.kind === 'bar'}
					class:isSub={line.kind === 'sub'}
					x1={getGridX(line)}
					x2={getGridX(line)}
					y1="0"
					y2="100"
				/>
			{/each}
		</svg>

		<div class="impulse-lane-plot" bind:this={plot}>
			{#if isGate}
				{#each visibleImpulses as impulse (impulse.id)}
					<span class="impulse-lane-hold" style:--impulse-x="{getImpulseX(impulse)}%" style:--impulse-width="{getHoldWidth(impulse)}%" style:--impulse-height="{getImpulseHeight(impulse)}%"></span>
				{/each}
			{/if}

			{#each visibleImpulses as impulse (impulse.id)}
				<div
					class="impulse-lane-impulse"
					class:isSelected={checkIsSelected(impulse)}
					class:isDragging={checkIsDragging(impulse)}
					data-impulse-id={impulse.id}
					style:--impulse-x="{getImpulseX(impulse)}%"
					style:--impulse-height="{getImpulseHeight(impulse)}%"
					role="slider"
					tabindex={getImpulseTabIndex(impulse)}
					aria-label={describeImpulse(impulse)}
					aria-orientation="vertical"
					aria-valuemin={0}
					aria-valuemax={1}
					aria-valuenow={impulse.strength}
					onpointerenter={() => (hoveredImpulseId = impulse.id)}
					onpointerleave={() => (hoveredImpulseId = null)}
				></div>
			{/each}

			{#if isMarqueeShown}
				<span class="impulse-lane-marquee" style:--impulse-x="{marqueeLeft}%" style:--impulse-width="{marqueeWidth}%"></span>
			{/if}

			{#if pillImpulse !== undefined && !isCollapsed}
				<span class="impulse-lane-pill" style:--impulse-x="{getImpulseX(pillImpulse)}%">{pillLabel}</span>
			{/if}
		</div>

		<div class="impulse-lane-shade isStart" style:--impulse-lane-size="{trimStartPercent}%"></div>
		<div class="impulse-lane-shade isEnd" style:--impulse-lane-size="{trimEndInset}%"></div>

		{#if hasHover}
			<div class="impulse-lane-hover" style:--impulse-x="{hoverPercent}%"></div>
		{/if}
		{#if isPlayheadVisible}
			<div class="impulse-lane-playhead" style:--impulse-x="{playheadPercent}%"></div>
		{/if}

		{#if shouldShowHint}
			<span class="impulse-lane-hint">{hintText}</span>
		{/if}
	</div>

	<RowResizer rowId={props.track.id} kind="impulse" label={props.track.name} siblings={siblingRows} />
</div>
