<script lang="ts">
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon'
	import GridFourIcon from 'phosphor-svelte/lib/GridFourIcon'
	import RecordIcon from 'phosphor-svelte/lib/RecordIcon'
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon'
	import { getRowColor, getRowHeightStyle } from '../appearance.svelte'
	import { recordHistory } from '../automation.svelte'
	import { PATH_WIDTH } from '../engine/automation'
	import { formatHitCount, getRoleLabel } from '../engine/hits'
	import { getRoleColor } from '../engine/palette'
	import { clamp } from '../engine/settings'
	import { getTrackSourceId } from '../engine/sources'
	import { checkIsTimeVisible, formatPreciseTime, getViewEnd, ratioToTime, snapToGrid, timeToPercent, timeToRatio } from '../engine/timeline'
	import type { GridLineT, TimelineGridT } from '../engine/timeline'
	import type { HitTrackT, TrackHitT } from '../engine/types'
	import {
		addHit,
		addHitsToSelection,
		armTrack,
		checkIsHitSelected,
		checkIsTrackCollapsed,
		clearHitSelection,
		deleteHits,
		getSelectedHitCount,
		moveHits,
		removeTrack,
		renameTrack,
		selectHits,
		sources,
		toggleHitSelected,
		toggleTrackCollapsed
	} from '../sources.svelte'
	import type { HitMoveT } from '../sources.svelte'
	import { app, getLiveSignals } from '../store.svelte'
	import { timeline } from '../timeline.svelte'
	import ColorDot from './ColorDot.svelte'
	import RowResizer from './RowResizer.svelte'
	import './HitLane.css'

	type HitLanePropsT = {
		track: HitTrackT
		grid: TimelineGridT
		onpattern: (trackId: string, anchor: HTMLElement) => void
	}

	// Dragging moves every selected hit together: time by the
	// grabbed hit's snapped move, strength by the vertical travel.
	type GroupDragT = {
		anchorHitId: string
		anchorStartTime: number
		startX: number
		startY: number
		plotHeight: number
		starts: Map<string, TrackHitT>
		hasMoved: boolean
	}

	// A press on empty space: a click adds a hit, a drag draws a
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

	const props: HitLanePropsT = $props()

	const MIN_NEW_STRENGTH = 0.15
	const TIME_KEY_STEP = 0.01
	const STRENGTH_KEY_STEP = 0.05
	const FINE_DIVIDER = 10
	const DRAG_THRESHOLD_PX = 3

	let plot = $state<HTMLDivElement | undefined>(undefined)
	let drag = $state<GroupDragT | null>(null)
	let marquee = $state<MarqueeT | null>(null)
	let hoveredHitId = $state<string | null>(null)

	const view = $derived(timeline.view)
	const duration = $derived(app.duration)
	const hits = $derived(props.track.hits)
	const isCollapsed = $derived(checkIsTrackCollapsed(props.track.id))
	const isArmed = $derived(sources.armedTrackId === props.track.id)
	const isGate = $derived(props.track.shape === 'gate')
	const trackColor = $derived(getRowColor(props.track.id, getRoleColor(props.track.role)))
	const customHeight = $derived(getRowHeightStyle(props.track.id))
	const hitCountLabel = $derived(formatHitCount(hits.length))
	const roleLabel = $derived(getRoleLabel(props.track.role))
	const hasRole = $derived(props.track.role !== 'none')
	// The role shows as the lane's color, and in full on hover.
	const metaTitle = $derived(hasRole ? `${hitCountLabel} · ${roleLabel}` : hitCountLabel)
	const selectedCount = $derived(getSelectedHitCount(props.track.id))
	const hasSelection = $derived(selectedCount > 0)
	const countLabel = $derived(hasSelection ? `${selectedCount} selected` : hitCountLabel)
	const collapseLabel = $derived(isCollapsed ? `Expand ${props.track.name}` : `Collapse ${props.track.name}`)
	const armLabel = $derived(isArmed ? 'Stop tapping' : 'Arm for tapping · press T while playing')
	const isEmpty = $derived(hits.length === 0)
	const shouldShowHint = $derived(!isCollapsed && (isEmpty || isArmed || hasSelection))

	const buildHint = (): string => {
		if (isArmed) return 'Tapping · press T in time while the song plays'
		if (hasSelection) return 'Drag to move · Delete to remove · ⌘A selects all · Esc clears'
		return 'Click to add · Drag across to select · Shift-click to add to a selection'
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

	// Hits just outside the view stay rendered so a drag that
	// leaves the edge keeps its elements.
	const visibleHits = $derived.by(() => {
		const margin = view.span * 0.02
		const earliest = view.start - margin
		const latest = getViewEnd(view) + margin
		const draggingIds = drag === null ? null : drag.starts
		return hits.filter((hit) => {
			const isInWindow = hit.time + hit.length >= earliest && hit.time <= latest
			const isDragging = draggingIds !== null && draggingIds.has(hit.id)
			return isInWindow || isDragging
		})
	})

	const isMarqueeShown = $derived(marquee !== null && marquee.isActive)
	const marqueeStart = $derived(marquee === null ? 0 : Math.min(marquee.startTime, marquee.currentTime))
	const marqueeEnd = $derived(marquee === null ? 0 : Math.max(marquee.startTime, marquee.currentTime))
	const marqueeLeft = $derived(timeToPercent(marqueeStart, view))
	const marqueeWidth = $derived(timeToPercent(marqueeEnd, view) - marqueeLeft)

	const pillHitId = $derived(drag === null ? hoveredHitId : drag.anchorHitId)
	const pillHit = $derived(hits.find((hit) => hit.id === pillHitId))
	const pillLabel = $derived(pillHit === undefined ? '' : `${Math.round(pillHit.strength * 100)}% · ${formatPreciseTime(pillHit.time)}`)

	const getGridX = (line: GridLineT): number => timeToRatio(line.time, view) * PATH_WIDTH

	const getHitX = (hit: TrackHitT): number => timeToPercent(hit.time, view)

	const getHoldWidth = (hit: TrackHitT): number => (hit.length / view.span) * 100

	const getHitHeight = (hit: TrackHitT): number => hit.strength * 100

	const checkIsSelected = (hit: TrackHitT): boolean => checkIsHitSelected(props.track.id, hit.id)

	const checkIsDragging = (hit: TrackHitT): boolean => drag !== null && drag.hasMoved && drag.starts.has(hit.id)

	// Only selected hits are in the tab order, so a dense track
	// is not hundreds of tab stops.
	const getHitTabIndex = (hit: TrackHitT): number => (checkIsSelected(hit) ? 0 : -1)

	const describeHit = (hit: TrackHitT): string => {
		const strength = Math.round(hit.strength * 100)
		return `${props.track.name} hit at ${formatPreciseTime(hit.time)}, strength ${strength}%`
	}

	const readRawTime = (clientX: number): number => {
		if (plot === undefined) return 0
		const bounds = plot.getBoundingClientRect()
		const xRatio = clamp((clientX - bounds.left) / bounds.width, 0, 1)
		return clamp(ratioToTime(xRatio, view), 0, duration)
	}

	const readPlotPosition = (event: PointerEvent): PlotPositionT => {
		if (plot === undefined) return { time: 0, strength: 0 }
		const bounds = plot.getBoundingClientRect()
		const yRatio = clamp((event.clientY - bounds.top) / bounds.height, 0, 1)
		const rawTime = readRawTime(event.clientX)
		const shouldSnap = timeline.isSnapping && !event.shiftKey
		const snappedTime = shouldSnap ? clamp(snapToGrid(rawTime, props.grid), 0, duration) : rawTime
		return { time: snappedTime, strength: 1 - yRatio }
	}

	const readHitId = (target: EventTarget | null): string | null => {
		const isElement = target instanceof Element
		if (!isElement) return null
		const element = target.closest<HTMLElement>('[data-hit-id]')
		if (element === null) return null
		return element.dataset.hitId ?? null
	}

	const findHit = (hitId: string): TrackHitT | undefined => hits.find((hit) => hit.id === hitId)

	const getSelectedIds = (): string[] => {
		const isThisTrack = sources.hitSelection.trackId === props.track.id
		if (!isThisTrack) return []
		return sources.hitSelection.hitIds
	}

	const captureStarts = (hitIds: string[]): Map<string, TrackHitT> => {
		const starts = new Map<string, TrackHitT>()
		for (const hitId of hitIds) {
			const hit = findHit(hitId)
			if (hit !== undefined) starts.set(hitId, { ...hit })
		}
		return starts
	}

	const startGroupDrag = (event: PointerEvent, hit: TrackHitT) => {
		if (plot === undefined) return
		const isAlreadySelected = checkIsSelected(hit)
		if (!isAlreadySelected) selectHits(props.track.id, [hit.id])
		const track = event.currentTarget as HTMLElement
		track.setPointerCapture(event.pointerId)
		const bounds = plot.getBoundingClientRect()
		drag = {
			anchorHitId: hit.id,
			anchorStartTime: hit.time,
			startX: event.clientX,
			startY: event.clientY,
			plotHeight: bounds.height,
			starts: captureStarts(getSelectedIds()),
			hasMoved: false
		}
	}

	// Alt-click and double-click take out the whole selection
	// when the hit is part of it, or just that hit.
	const deleteFromHit = (hitId: string) => {
		const isInSelection = checkIsHitSelected(props.track.id, hitId)
		const doomedIds = isInSelection ? getSelectedIds() : [hitId]
		deleteHits(props.track.id, doomedIds)
	}

	const handleHitDown = (event: PointerEvent, hitId: string) => {
		const hit = findHit(hitId)
		if (hit === undefined) return
		if (event.altKey) return deleteFromHit(hitId)
		const isToggle = event.shiftKey || event.metaKey || event.ctrlKey
		if (isToggle) return toggleHitSelected(props.track.id, hitId)
		startGroupDrag(event, hit)
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
			clickPosition: readPlotPosition(event)
		}
	}

	const handleTrackDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		const canEdit = duration > 0 && !isCollapsed
		if (!isPrimaryButton || !canEdit) return
		const hitId = readHitId(event.target)
		const isOnHit = hitId !== null
		if (isOnHit) return handleHitDown(event, hitId)
		startMarquee(event)
	}

	const checkIsPastThreshold = (dx: number, dy: number): boolean => {
		return Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX
	}

	const buildMoves = (activeDrag: GroupDragT, timeDelta: number, strengthDelta: number): HitMoveT[] => {
		return Array.from(activeDrag.starts.values()).map((start) => ({
			hitId: start.id,
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
		const position = readPlotPosition(event)
		const timeDelta = position.time - activeDrag.anchorStartTime
		const strengthDelta = -dy / activeDrag.plotHeight
		moveHits(props.track.id, buildMoves(activeDrag, timeDelta, strengthDelta))
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
		const boxedHits = hits.filter((hit) => hit.time >= startTime && hit.time <= endTime)
		const boxedIds = boxedHits.map((hit) => hit.id)
		if (activeMarquee.isAdditive) return addHitsToSelection(props.track.id, boxedIds)
		selectHits(props.track.id, boxedIds)
	}

	// A plain click on empty space clears a selection first, and
	// only adds a hit when nothing was selected.
	const finishClick = (activeMarquee: MarqueeT) => {
		const hasAnySelection = sources.hitSelection.hitIds.length > 0
		if (hasAnySelection) return clearHitSelection()
		const position = activeMarquee.clickPosition
		const strength = Math.max(MIN_NEW_STRENGTH, position.strength)
		const holdLength = isGate ? props.grid.snapStep : 0
		addHit(props.track.id, position.time, strength, holdLength)
	}

	const handleTrackUp = () => {
		const activeDrag = drag
		const activeMarquee = marquee
		drag = null
		marquee = null
		const wasClickOnHit = activeDrag !== null && !activeDrag.hasMoved
		if (wasClickOnHit) return selectHits(props.track.id, [activeDrag.anchorHitId])
		if (activeMarquee === null) return
		if (activeMarquee.isActive) return finishMarquee(activeMarquee)
		finishClick(activeMarquee)
	}

	const handleTrackDoubleClick = (event: MouseEvent) => {
		if (isCollapsed) return toggleTrackCollapsed(props.track.id)
		const hitId = readHitId(event.target)
		if (hitId === null) return
		deleteFromHit(hitId)
	}

	const buildKeyMoves = (timeDelta: number, strengthDelta: number): HitMoveT[] => {
		const selected = getSelectedIds().map(findHit).filter((hit): hit is TrackHitT => hit !== undefined)
		return selected.map((hit) => ({ hitId: hit.id, time: hit.time + timeDelta, strength: hit.strength + strengthDelta }))
	}

	const handleHitKey = (event: KeyboardEvent) => {
		const isFine = event.shiftKey
		const divider = isFine ? FINE_DIVIDER : 1
		const timeDeltas: Partial<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 }
		const strengthDeltas: Partial<Record<string, number>> = { ArrowDown: -1, ArrowUp: 1 }
		const timeDelta = timeDeltas[event.key] ?? 0
		const strengthDelta = strengthDeltas[event.key] ?? 0
		const isArrow = timeDelta !== 0 || strengthDelta !== 0
		if (!isArrow) return
		event.preventDefault()
		event.stopPropagation()
		recordHistory()
		const moves = buildKeyMoves((timeDelta * TIME_KEY_STEP) / divider, (strengthDelta * STRENGTH_KEY_STEP) / divider)
		moveHits(props.track.id, moves)
	}

	const handleNameInput = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		renameTrack(props.track.id, detail.value)
	}

	const handleToggle = () => toggleTrackCollapsed(props.track.id)

	// The button lets go of focus, so Space plays the song
	// instead of pressing it again.
	const handleArm = (event: MouseEvent) => {
		const button = event.currentTarget as HTMLButtonElement
		button.blur()
		const nextArmed = isArmed ? null : props.track.id
		armTrack(nextArmed)
	}

	const handlePattern = (event: MouseEvent) => {
		const anchor = event.currentTarget as HTMLElement
		props.onpattern(props.track.id, anchor)
	}

	const handleRemove = () => removeTrack(props.track.id)
</script>

<div class="hit-lane" class:isCollapsed class:isArmed class:hasSelection data-tone={trackColor} style:--hit-lane-custom-height={customHeight}>
	<div class="hit-lane-header">
		<div class="hit-lane-title">
			<button class="hit-lane-caret" type="button" aria-expanded={!isCollapsed} aria-label={collapseLabel} onclick={handleToggle}>
				<CaretRightIcon weight="bold" />
			</button>
			<ColorDot rowId={props.track.id} color={trackColor} label={props.track.name} isSquare />
			{#if isCollapsed}
				<span class="hit-lane-name">{props.track.name}</span>
				<span class="hit-lane-count isCompact">{hits.length}</span>
			{:else}
				<z-input class="hit-lane-input" size="sm" value={props.track.name} placeholder="Track name" aria-label="Track name" oninput={handleNameInput} onchange={handleNameInput}></z-input>
			{/if}
		</div>

		{#if !isCollapsed}
			<div class="hit-lane-meta">
				<span class="hit-lane-meter" aria-hidden="true">
					<span class="hit-lane-meter-fill" style:--hit-lane-level={liveStyle}></span>
				</span>
				<span class="hit-lane-count" class:isSelection={hasSelection} title={metaTitle}>{countLabel}</span>
				<div class="hit-lane-actions">
					<z-tooltip content={armLabel} placement="top">
						<button class="hit-lane-action isRecord" class:isOn={isArmed} type="button" aria-label={armLabel} aria-pressed={isArmed} onclick={handleArm}>
							<RecordIcon weight="fill" />
						</button>
					</z-tooltip>
					<z-tooltip content="Paint a step pattern" placement="top">
						<button class="hit-lane-action" type="button" aria-label="Paint a step pattern" onclick={handlePattern}>
							<GridFourIcon weight="bold" />
						</button>
					</z-tooltip>
					<z-tooltip content="Remove track" placement="top">
						<button class="hit-lane-action isDanger" type="button" aria-label="Remove track" onclick={handleRemove}>
							<TrashIcon weight="bold" />
						</button>
					</z-tooltip>
				</div>
			</div>
		{/if}
	</div>

	<div
		class="hit-lane-track"
		data-track="lane"
		role="group"
		aria-label="{props.track.name} hits"
		onpointerdown={handleTrackDown}
		onpointermove={handleTrackMove}
		onpointerup={handleTrackUp}
		onpointercancel={handleTrackUp}
		ondblclick={handleTrackDoubleClick}
	>
		<svg class="hit-lane-grid" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
			{#each gridLines as line (line.time)}
				<line
					class="hit-lane-gridline"
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

		<div class="hit-lane-plot" bind:this={plot}>
			{#if isGate}
				{#each visibleHits as hit (hit.id)}
					<span class="hit-lane-hold" style:--hit-x="{getHitX(hit)}%" style:--hit-width="{getHoldWidth(hit)}%" style:--hit-height="{getHitHeight(hit)}%"></span>
				{/each}
			{/if}

			{#each visibleHits as hit (hit.id)}
				<div
					class="hit-lane-hit"
					class:isSelected={checkIsSelected(hit)}
					class:isDragging={checkIsDragging(hit)}
					data-hit-id={hit.id}
					style:--hit-x="{getHitX(hit)}%"
					style:--hit-height="{getHitHeight(hit)}%"
					role="slider"
					tabindex={getHitTabIndex(hit)}
					aria-label={describeHit(hit)}
					aria-orientation="vertical"
					aria-valuemin={0}
					aria-valuemax={1}
					aria-valuenow={hit.strength}
					onpointerenter={() => (hoveredHitId = hit.id)}
					onpointerleave={() => (hoveredHitId = null)}
					onkeydown={handleHitKey}
				></div>
			{/each}

			{#if isMarqueeShown}
				<span class="hit-lane-marquee" style:--hit-x="{marqueeLeft}%" style:--hit-width="{marqueeWidth}%"></span>
			{/if}

			{#if pillHit !== undefined && !isCollapsed}
				<span class="hit-lane-pill" style:--hit-x="{getHitX(pillHit)}%">{pillLabel}</span>
			{/if}
		</div>

		<div class="hit-lane-shade isStart" style:--hit-lane-size="{trimStartPercent}%"></div>
		<div class="hit-lane-shade isEnd" style:--hit-lane-size="{trimEndInset}%"></div>

		{#if hasHover}
			<div class="hit-lane-hover" style:--hit-x="{hoverPercent}%"></div>
		{/if}
		{#if isPlayheadVisible}
			<div class="hit-lane-playhead" style:--hit-x="{playheadPercent}%"></div>
		{/if}

		{#if shouldShowHint}
			<span class="hit-lane-hint">{hintText}</span>
		{/if}
	</div>

	<RowResizer rowId={props.track.id} label={props.track.name} />
</div>
