<script lang="ts">
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon'
	import EyeIcon from 'phosphor-svelte/lib/EyeIcon'
	import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlashIcon'
	import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon'
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon'
	import {
		AutomationPattern,
		applyAutomationPattern,
		automation,
		checkIsPointSelected,
		deletePoint,
		getSelectedPointCount,
		getValueForNewPoint,
		addPoint,
		movePoints,
		recordHistory,
		removeLane,
		setPointBend,
		toggleLaneBypassed
	} from '../automation.svelte'
	import type { AutomationPatternT, PointMoveT } from '../automation.svelte'
	import {
		MIN_POINT_GAP,
		PATH_WIDTH,
		buildAreaPath,
		buildLinePath,
		buildVertices,
		findSegmentStart,
		formatControlValue,
		getLiveLaneValue,
		getTargetBase,
		getTargetControl,
		toControlValue,
		toNormalized
	} from '../engine/automation'
	import { clamp } from '../engine/settings'
	import { checkIsTimeVisible, formatPreciseTime, getViewEnd, ratioToTime, snapToGrid, timeToPercent, timeToRatio } from '../engine/timeline'
	import type { GridLineT, TimelineGridT } from '../engine/timeline'
	import type { AutomationLaneT, AutomationPointT, LayerT } from '../engine/types'
	import { getLaneColor } from '../appearance.svelte'
	import { layerStore } from '../layers.svelte'
	import { openRowInspector } from '../rowInspector.svelte'
	import { getRowHeightCss, toggleRowFolded, checkIsRowFolded } from '../rowLayout.svelte'
	import type { RowRefT } from '../rowLayout.svelte'
	import { checkIsLaneSelected, pickLane, pickPoint, pickPointsInBox, readModifiers, selectPlacedPoint } from '../selection.svelte'
	import type { PickModifiersT } from '../selection.svelte'
	import { app, seekTo } from '../store.svelte'
	import { timeline } from '../timeline.svelte'
	import { checkIsPrimaryModifierHeld } from './focus'
	import RowResizer from './RowResizer.svelte'
	import { rowHeader } from './rowHeader'
	import './AutomationLane.css'
	import './ValuePill.css'

	type AutomationLanePropsT = {
		lane: AutomationLaneT
		grid: TimelineGridT
		// Lanes under a layer sit indented below its header.
		isNested?: boolean
		// The lanes in this lane's group, in the order shown. They
		// are its siblings for range selection and the primary
		// modifier gestures.
		siblingLaneIds: string[]
		onedit: (laneId: string, pointId: string, anchor: HTMLElement) => void
	}

	type PlotPositionT = { time: number; value: number }

	// Dragging moves every selected point together: time by the
	// grabbed point's snapped move, value by the vertical travel.
	type PointDragT = {
		anchorPointId: string
		anchorStartTime: number
		startX: number
		startY: number
		plotHeight: number
		starts: Map<string, PlotPositionT>
		hasMoved: boolean
		// Shift, Cmd or Ctrl on the press picks on button-up, when
		// the press turns out to be a click and not a drag.
		pendingPick: PickModifiersT | null
		// The value change last applied, and the one Cmd or Ctrl holds.
		lastValueDelta: number
		heldValueDelta: number | null
	}

	// A press on empty plot. A click sets the playhead there when the
	// button comes up. A drag draws a selection box instead.
	type MarqueeT = {
		startX: number
		startTime: number
		currentTime: number
		isAdditive: boolean
		isActive: boolean
		clickTime: number
	}

	type TimeSelectionT = { start: number; end: number }
	type PatternMenuT = { x: number; y: number }

	// An Alt-drag on a segment previews its bow, and stores it
	// once, when the button comes up.
	type BendDragT = {
		pointId: string
		startY: number
		startBend: number
		plotHeight: number
		previewBend: number
		hasMoved: boolean
	}

	const props: AutomationLanePropsT = $props()

	const BEND_PER_PLOT_HEIGHT = 2
	const PILL_FLIP_VALUE = 0.62
	const DRAG_THRESHOLD_PX = 3

	let root: HTMLDivElement
	let header: HTMLDivElement
	let plot = $state<HTMLDivElement | undefined>(undefined)
	let pointDrag = $state<PointDragT | null>(null)
	let marquee = $state<MarqueeT | null>(null)
	let timeSelection = $state<TimeSelectionT | null>(null)
	let patternMenu = $state<PatternMenuT | null>(null)
	let patternMenuRoot = $state<HTMLDivElement | undefined>(undefined)
	let bendDrag = $state<BendDragT | null>(null)
	let hoveredPointId = $state<string | null>(null)

	const row = $derived<RowRefT>({ kind: 'lane', id: props.lane.id })
	const siblingRows = $derived(props.siblingLaneIds.filter((laneId) => laneId !== props.lane.id).map((laneId): RowRefT => ({ kind: 'lane', id: laneId })))
	const layers = $derived(layerStore.layers as LayerT[])
	const control = $derived(getTargetControl(props.lane.target, layers))
	const hasControl = $derived(control !== null)
	const duration = $derived(app.duration)
	const view = $derived(timeline.view)
	const points = $derived(props.lane.points)
	const pointCount = $derived(points.length)
	const isFolded = $derived(checkIsRowFolded(row))
	const isBypassed = $derived(props.lane.isBypassed === true)
	const isSelected = $derived(checkIsLaneSelected(props.lane.id))
	const laneColor = $derived(getLaneColor(props.lane, layers))
	const customHeight = $derived(getRowHeightCss(row))
	const controlLabel = $derived(control === null ? 'No control' : control.label)
	const laneName = $derived(props.lane.name ?? controlLabel)
	const collapseLabel = $derived(isFolded ? `Expand ${laneName}` : `Fold ${laneName}`)
	const bypassLabel = $derived(isBypassed ? `Use ${laneName}` : `Bypass ${laneName}`)
	const selectedPointCount = $derived(getSelectedPointCount(props.lane.id))
	const hasSelectedPoint = $derived(selectedPointCount > 0)
	const shouldShowHint = $derived(hasControl && pointCount <= 1 && !isFolded)

	const baseNormalized = $derived.by(() => {
		const base = getTargetBase(props.lane.target, app.settings, layers)
		if (control === null || base === null) return 0
		return toNormalized(control, base)
	})

	// While a bow is being dragged the lane draws the preview,
	// and the stored points stay as they were.
	const shownPoints = $derived.by(() => {
		const activeBend = bendDrag
		if (activeBend === null) return points
		return points.map((point) => {
			const isBent = point.id === activeBend.pointId
			if (!isBent) return point
			return { ...point, bend: activeBend.previewBend }
		})
	})

	const vertices = $derived(buildVertices(shownPoints, view, baseNormalized))
	const linePath = $derived(buildLinePath(vertices))
	const areaPath = $derived(buildAreaPath(vertices))

	const liveValue = $derived(getLiveLaneValue(props.lane, app.settings, layers, app.currentTime))
	const liveLabel = $derived(liveValue === null ? '—' : formatControlValue(liveValue))

	// Every line the ruler draws, so a point can be placed on exactly
	// what it will snap to.
	const gridLines = $derived(props.grid.lines)
	const playheadPercent = $derived(timeToPercent(app.currentTime, view))
	const isPlayheadVisible = $derived(checkIsTimeVisible(app.currentTime, view))
	const hoverTime = $derived(timeline.hoverTime)
	const hasHover = $derived(hoverTime !== null && checkIsTimeVisible(hoverTime, view))
	const hoverPercent = $derived(hoverTime === null ? 0 : timeToPercent(hoverTime, view))
	const trimStartPercent = $derived(clamp(timeToPercent(app.trimStart, view), 0, 100))
	const trimEndInset = $derived(clamp(100 - timeToPercent(app.trimEnd, view), 0, 100))

	// Points just outside the view stay rendered so a drag that
	// leaves the edge does not lose its element mid-gesture.
	const visiblePoints = $derived.by(() => {
		const margin = view.span * 0.05
		const earliest = view.start - margin
		const latest = getViewEnd(view) + margin
		const draggedIds = pointDrag === null ? null : pointDrag.starts
		return points.filter((point) => {
			const isInWindow = point.time >= earliest && point.time <= latest
			const isActive = draggedIds !== null && draggedIds.has(point.id)
			return isInWindow || isActive
		})
	})

	const isMarqueeShown = $derived(marquee !== null && marquee.isActive)
	const marqueeLeftTime = $derived(marquee === null ? 0 : Math.min(marquee.startTime, marquee.currentTime))
	const marqueeRightTime = $derived(marquee === null ? 0 : Math.max(marquee.startTime, marquee.currentTime))
	const marqueeLeft = $derived(timeToPercent(marqueeLeftTime, view))
	const marqueeWidth = $derived(timeToPercent(marqueeRightTime, view) - marqueeLeft)
	const selectionLeft = $derived(timeSelection === null ? 0 : timeToPercent(timeSelection.start, view))
	const selectionWidth = $derived(timeSelection === null ? 0 : timeToPercent(timeSelection.end, view) - selectionLeft)

	const pillPointId = $derived(pointDrag === null ? hoveredPointId : pointDrag.anchorPointId)
	const pillPoint = $derived(points.find((point) => point.id === pillPointId))

	const pillTimeLabel = $derived(pillPoint === undefined ? '' : formatPreciseTime(pillPoint.time))

	const pillValueLabel = $derived.by(() => {
		if (pillPoint === undefined || control === null) return ''
		return formatControlValue(toControlValue(control, pillPoint.value))
	})

	const isPillBelow = $derived(pillPoint !== undefined && pillPoint.value > PILL_FLIP_VALUE)

	const isFlashing = $derived(automation.revealedLaneId === props.lane.id)

	$effect(() => {
		if (!isFlashing) return
		root.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
	})

	const getPointX = (point: AutomationPointT): number => timeToPercent(point.time, view)

	const getPointY = (point: AutomationPointT): number => (1 - point.value) * 100

	const getGridX = (line: GridLineT): number => timeToRatio(line.time, view) * PATH_WIDTH

	const describePoint = (point: AutomationPointT): string => {
		if (control === null) return 'Point'
		const value = formatControlValue(toControlValue(control, point.value))
		return `${control.label} ${value} at ${formatPreciseTime(point.time)}`
	}

	const checkIsSelectedPoint = (point: AutomationPointT): boolean => checkIsPointSelected(props.lane.id, point.id)

	// Only selected points are in the tab order, so a dense lane
	// is not hundreds of tab stops.
	const getPointTabIndex = (point: AutomationPointT): number => (checkIsSelectedPoint(point) ? 0 : -1)

	const checkIsDraggingPoint = (point: AutomationPointT): boolean => pointDrag !== null && pointDrag.hasMoved && pointDrag.starts.has(point.id)

	const readRawPosition = (clientX: number, clientY: number): PlotPositionT => {
		if (plot === undefined) return { time: 0, value: 0 }
		const bounds = plot.getBoundingClientRect()
		const xRatio = clamp((clientX - bounds.left) / bounds.width, 0, 1)
		const yRatio = clamp((clientY - bounds.top) / bounds.height, 0, 1)
		const time = clamp(ratioToTime(xRatio, view), 0, duration)
		return { time, value: 1 - yRatio }
	}

	const snapTime = (time: number, event: PointerEvent): number => {
		const shouldSnap = timeline.isSnapping && !event.shiftKey
		if (!shouldSnap) return time
		return clamp(snapToGrid(time, props.grid), 0, duration)
	}

	const readSnappedPosition = (event: PointerEvent): PlotPositionT => {
		const raw = readRawPosition(event.clientX, event.clientY)
		return { time: snapTime(raw.time, event), value: raw.value }
	}

	// While a point is dragged, Shift locks its value, so it does not
	// also free the time from the grid.
	const readDragPosition = (event: PointerEvent): PlotPositionT => {
		const raw = readRawPosition(event.clientX, event.clientY)
		const shouldSnap = timeline.isSnapping
		const time = shouldSnap ? clamp(snapToGrid(raw.time, props.grid), 0, duration) : raw.time
		return { time, value: raw.value }
	}

	const readPointId = (target: EventTarget | null): string | null => {
		const isElement = target instanceof Element
		if (!isElement) return null
		const element = target.closest<HTMLElement>('[data-point-id]')
		if (element === null) return null
		return element.dataset.pointId ?? null
	}

	const findPoint = (pointId: string): AutomationPointT | undefined => points.find((point) => point.id === pointId)

	const getSelectedIds = (): string[] => {
		const isThisLane = automation.selectedPointLaneId === props.lane.id
		if (!isThisLane) return []
		return automation.selectedPointIds
	}

	const captureStarts = (pointIds: string[]): Map<string, PlotPositionT> => {
		const starts = new Map<string, PlotPositionT>()
		for (const pointId of pointIds) {
			const point = findPoint(pointId)
			if (point !== undefined) starts.set(pointId, { time: point.time, value: point.value })
		}
		return starts
	}

	const checkIsPastThreshold = (dx: number, dy: number): boolean => {
		return Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX
	}

	// ---- Rows ----------------------------------------------

	const handleSelectRow = (event: PointerEvent) => {
		pickLane(props.lane.id, props.siblingLaneIds, readModifiers(event))
	}

	const handleInspect = (anchor: HTMLElement) => openRowInspector('lane', props.lane.id, anchor)

	const handleSettings = () => openRowInspector('lane', props.lane.id, header)

	const handleRemove = () => removeLane(props.lane.id)

	// The caret folds the row. It does not select or deselect.
	const handleToggle = (event: MouseEvent) => {
		const siblings = event.metaKey || event.ctrlKey ? siblingRows : []
		toggleRowFolded(row, siblings)
	}

	const headerOptions = $derived({
		row,
		getSiblings: () => siblingRows,
		onselect: handleSelectRow,
		oninspect: handleInspect
	})

	// ---- Plot ----------------------------------------------

	const startPointDrag = (event: PointerEvent, point: AutomationPointT, pendingPick: PickModifiersT | null) => {
		if (plot === undefined) return
		const isAlreadySelected = checkIsSelectedPoint(point)
		const isPlainPress = pendingPick === null
		if (isPlainPress && !isAlreadySelected) pickPoint(props.lane.id, point.id, { isRange: false, isToggle: false })
		const track = event.currentTarget as HTMLElement
		track.setPointerCapture(event.pointerId)
		const bounds = plot.getBoundingClientRect()
		const movingIds = isAlreadySelected || isPlainPress ? getSelectedIds() : [point.id]
		pointDrag = {
			anchorPointId: point.id,
			anchorStartTime: point.time,
			startX: event.clientX,
			startY: event.clientY,
			plotHeight: bounds.height,
			starts: captureStarts(movingIds),
			hasMoved: false,
			pendingPick,
			lastValueDelta: 0,
			heldValueDelta: null
		}
	}

	const handlePointDown = (event: PointerEvent, pointId: string) => {
		const point = findPoint(pointId)
		if (point === undefined) return
		timeSelection = null
		patternMenu = null
		const modifiers = readModifiers(event)
		const isPicking = modifiers.isRange || modifiers.isToggle
		startPointDrag(event, point, isPicking ? modifiers : null)
	}

	const startBend = (event: PointerEvent) => {
		if (plot === undefined) return
		const raw = readRawPosition(event.clientX, event.clientY)
		const startIndex = findSegmentStart(points, raw.time)
		const isOnSegment = startIndex !== -1
		if (!isOnSegment) return
		const segmentStart = points[startIndex]
		const track = event.currentTarget as HTMLElement
		track.setPointerCapture(event.pointerId)
		const bounds = plot.getBoundingClientRect()
		bendDrag = {
			pointId: segmentStart.id,
			startY: event.clientY,
			startBend: segmentStart.bend,
			plotHeight: bounds.height,
			previewBend: segmentStart.bend,
			hasMoved: false
		}
	}

	const startMarquee = (event: PointerEvent) => {
		const track = event.currentTarget as HTMLElement
		track.setPointerCapture(event.pointerId)
		const startTime = readRawPosition(event.clientX, event.clientY).time
		timeSelection = null
		patternMenu = null
		marquee = {
			startX: event.clientX,
			startTime,
			currentTime: startTime,
			isAdditive: event.shiftKey,
			isActive: false,
			clickTime: readSnappedPosition(event).time
		}
	}

	const handleTrackDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		const canEdit = duration > 0 && !isFolded
		if (!isPrimaryButton || !canEdit) return
		const pointId = readPointId(event.target)
		const isOnPoint = pointId !== null
		if (isOnPoint) return handlePointDown(event, pointId)
		if (event.altKey) return startBend(event)
		startMarquee(event)
	}

	// One undo step per drag, recorded when it really moves.
	const buildMoves = (activeDrag: PointDragT, timeDelta: number, valueDelta: number): PointMoveT[] => {
		return Array.from(activeDrag.starts.entries()).map(([pointId, start]) => ({
			pointId,
			time: start.time + timeDelta,
			value: start.value + valueDelta
		}))
	}

	// Shift locks the value to what it was when the drag began, so the
	// point only moves in time. Cmd or Ctrl locks it to what it is when
	// the key goes down, so it can be placed in time at a chosen height.
	const resolveValueDelta = (event: PointerEvent, activeDrag: PointDragT, freeDelta: number): number => {
		const isShift = event.shiftKey
		const isControl = event.ctrlKey || event.metaKey
		if (isShift) return 0
		if (!isControl) {
			activeDrag.heldValueDelta = null
			return freeDelta
		}
		if (activeDrag.heldValueDelta === null) activeDrag.heldValueDelta = activeDrag.lastValueDelta
		return activeDrag.heldValueDelta
	}

	const moveGroup = (event: PointerEvent, activeDrag: PointDragT) => {
		const dx = event.clientX - activeDrag.startX
		const dy = event.clientY - activeDrag.startY
		const hasStartedMoving = activeDrag.hasMoved || checkIsPastThreshold(dx, dy)
		if (!hasStartedMoving) return
		if (!activeDrag.hasMoved) recordHistory()
		activeDrag.hasMoved = true
		const position = readDragPosition(event)
		const requestedTimeDelta = position.time - activeDrag.anchorStartTime
		const selectedStarts = Array.from(activeDrag.starts.values())
		const earliestTime = Math.min(...selectedStarts.map((start) => start.time))
		const latestTime = Math.max(...selectedStarts.map((start) => start.time))
		const unselectedPoints = points.filter((point) => !activeDrag.starts.has(point.id))
		const precedingPoint = unselectedPoints.filter((point) => point.time < earliestTime).at(-1)
		const followingPoint = unselectedPoints.find((point) => point.time > latestTime)
		const minimumTime = precedingPoint === undefined ? 0 : precedingPoint.time + MIN_POINT_GAP
		const maximumTime = followingPoint === undefined ? duration : followingPoint.time - MIN_POINT_GAP
		const timeDelta = clamp(requestedTimeDelta, minimumTime - earliestTime, maximumTime - latestTime)
		const freeDelta = -dy / activeDrag.plotHeight
		const requestedValueDelta = resolveValueDelta(event, activeDrag, freeDelta)
		const lowestValue = Math.min(...selectedStarts.map((start) => start.value))
		const highestValue = Math.max(...selectedStarts.map((start) => start.value))
		const valueDelta = clamp(requestedValueDelta, -lowestValue, 1 - highestValue)
		activeDrag.lastValueDelta = valueDelta
		const moves = buildMoves(activeDrag, timeDelta, valueDelta)
		const isMovingLater = timeDelta > 0
		const orderedMoves = isMovingLater ? [...moves].reverse() : moves
		movePoints(props.lane.id, orderedMoves, duration)
	}

	const moveBend = (event: PointerEvent, activeBend: BendDragT) => {
		const dy = activeBend.startY - event.clientY
		const hasStartedMoving = activeBend.hasMoved || Math.abs(dy) > DRAG_THRESHOLD_PX
		if (!hasStartedMoving) return
		activeBend.hasMoved = true
		const travel = dy / activeBend.plotHeight
		const bend = activeBend.startBend + travel * BEND_PER_PLOT_HEIGHT
		activeBend.previewBend = clamp(bend, -1, 1)
	}

	const moveMarquee = (event: PointerEvent, activeMarquee: MarqueeT) => {
		const dx = event.clientX - activeMarquee.startX
		const isNowActive = activeMarquee.isActive || checkIsPastThreshold(dx, 0)
		activeMarquee.isActive = isNowActive
		activeMarquee.currentTime = readRawPosition(event.clientX, event.clientY).time
	}

	const handleTrackMove = (event: PointerEvent) => {
		const activeDrag = pointDrag
		if (activeDrag !== null) return moveGroup(event, activeDrag)
		const activeBend = bendDrag
		if (activeBend !== null) return moveBend(event, activeBend)
		const activeMarquee = marquee
		if (activeMarquee !== null) moveMarquee(event, activeMarquee)
	}

	const finishMarquee = (activeMarquee: MarqueeT) => {
		const leftTime = Math.min(activeMarquee.startTime, activeMarquee.currentTime)
		const rightTime = Math.max(activeMarquee.startTime, activeMarquee.currentTime)
		timeSelection = { start: leftTime, end: rightTime }
		const boxedPoints = points.filter((point) => point.time >= leftTime && point.time <= rightTime)
		const boxedIds = boxedPoints.map((point) => point.id)
		pickPointsInBox(props.lane.id, boxedIds, activeMarquee.isAdditive)
	}

	// A click on empty plot sets the playhead there.
	const seekToClick = (activeMarquee: MarqueeT) => {
		seekTo(activeMarquee.clickTime)
	}

	const handleTrackContextMenu = (event: MouseEvent) => {
		const selectedRange = timeSelection
		if (selectedRange === null || isFolded || !hasControl) return
		const clickTime = readRawPosition(event.clientX, event.clientY).time
		const isInsideRange = clickTime >= selectedRange.start && clickTime <= selectedRange.end
		if (!isInsideRange) return
		event.preventDefault()
		event.stopPropagation()
		patternMenu = { x: event.clientX, y: event.clientY }
	}

	const handlePatternPick = (pattern: AutomationPatternT) => {
		const selectedRange = timeSelection
		if (selectedRange === null) return
		const didApply = applyAutomationPattern(props.lane.id, selectedRange.start, selectedRange.end, pattern)
		if (!didApply) return
		patternMenu = null
		timeSelection = null
	}

	const handleWindowPointerDown = (event: PointerEvent) => {
		const isInsideLane = root.contains(event.target as Node)
		const isInsideMenu = patternMenuRoot?.contains(event.target as Node)
		if (!isInsideLane && !isInsideMenu) timeSelection = null
		if (patternMenu === null) return
		if (!isInsideMenu) patternMenu = null
	}

	const handleWindowKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') patternMenu = null
	}

	// A double-click on empty plot places a point, level with the one
	// before it. The pointer's height does not set the value.
	const placePointAt = (event: MouseEvent) => {
		if (plot === undefined) return
		const bounds = plot.getBoundingClientRect()
		const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
		const rawTime = clamp(ratioToTime(ratio, view), 0, duration)
		const shouldSnap = timeline.isSnapping && !event.shiftKey
		const time = shouldSnap ? clamp(snapToGrid(rawTime, props.grid), 0, duration) : rawTime
		const value = getValueForNewPoint(props.lane.id, time)
		const pointId = addPoint(props.lane.id, time, value)
		if (pointId === null) return
		selectPlacedPoint(props.lane.id, pointId)
	}

	const commitBend = (activeBend: BendDragT) => {
		if (!activeBend.hasMoved) return
		recordHistory()
		setPointBend(props.lane.id, activeBend.pointId, activeBend.previewBend)
	}

	const handleTrackUp = () => {
		const activeDrag = pointDrag
		const activeBend = bendDrag
		const activeMarquee = marquee
		pointDrag = null
		bendDrag = null
		marquee = null
		if (activeDrag !== null) {
			const wasClick = !activeDrag.hasMoved
			const clickModifiers = activeDrag.pendingPick ?? { isRange: false, isToggle: false }
			if (wasClick) pickPoint(props.lane.id, activeDrag.anchorPointId, clickModifiers)
			return
		}
		if (activeBend !== null) return commitBend(activeBend)
		if (activeMarquee === null) return
		if (activeMarquee.isActive) return finishMarquee(activeMarquee)
		seekToClick(activeMarquee)
	}

	const handleTrackCancel = () => {
		pointDrag = null
		bendDrag = null
		marquee = null
	}

	const handleTrackDoubleClick = (event: MouseEvent) => {
		if (isFolded) return toggleRowFolded(row, [])
		// The track captured the pointer, so the event's target is the
		// track. What is under the cursor says whether a point is hit.
		const pointId = readPointId(document.elementFromPoint(event.clientX, event.clientY))
		const isOnPoint = pointId !== null
		if (isOnPoint) return deletePoint(props.lane.id, pointId)
		const canEdit = hasControl && duration > 0
		if (!event.altKey && canEdit) return placePointAt(event)
		if (!event.altKey || plot === undefined) return
		const bounds = plot.getBoundingClientRect()
		const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
		const startIndex = findSegmentStart(points, ratioToTime(ratio, view))
		const isOnSegment = startIndex !== -1
		if (!isOnSegment) return
		recordHistory()
		setPointBend(props.lane.id, points[startIndex].id, 0)
	}

	const handlePointContextMenu = (event: MouseEvent, point: AutomationPointT) => {
		event.preventDefault()
		event.stopPropagation()
		pickPoint(props.lane.id, point.id, { isRange: false, isToggle: false })
		const element = event.currentTarget as HTMLElement
		props.onedit(props.lane.id, point.id, element)
	}

	const handlePointKey = (event: KeyboardEvent, point: AutomationPointT) => {
		const element = event.currentTarget as HTMLElement
		if (event.key === 'Enter') props.onedit(props.lane.id, point.id, element)
	}
</script>

<svelte:window onpointerdown={handleWindowPointerDown} onkeydown={handleWindowKeyDown} />

<div
	class="automation-lane"
	class:isFolded
	class:isBypassed
	class:isSelected
	class:isActive={hasSelectedPoint}
	class:isFlashing
	class:isNested={props.isNested}
	data-tone={laneColor}
	style:--lane-custom-height={customHeight}
	bind:this={root}
>
	<div class="automation-lane-header" role="presentation" bind:this={header} use:rowHeader={headerOptions}>
		<div class="automation-lane-title">
			<button class="automation-lane-caret" type="button" aria-expanded={!isFolded} aria-label={collapseLabel} onclick={handleToggle}>
				<CaretRightIcon weight="bold" />
			</button>
			<z-tooltip content={bypassLabel} placement="top" openDelay={300}>
				<button class="automation-lane-action" type="button" aria-label={bypassLabel} aria-pressed={isBypassed} onclick={() => toggleLaneBypassed(props.lane.id)}>
					{#if isBypassed}
						<EyeSlashIcon weight="bold" />
					{/if}
					{#if !isBypassed}
						<EyeIcon weight="bold" />
					{/if}
				</button>
			</z-tooltip>
			<span class="automation-lane-name">{laneName}</span>
			<span class="automation-lane-value">{liveLabel}</span>
			{#if !isFolded}
				<div class="automation-lane-actions">
					<z-tooltip content="Lane settings" placement="top">
						<button class="automation-lane-action" type="button" aria-label="Lane settings" onclick={handleSettings}>
							<GearSixIcon weight="bold" />
						</button>
					</z-tooltip>
					<z-tooltip content="Remove lane" placement="top">
						<button class="automation-lane-action isDanger" type="button" aria-label="Remove lane" onclick={handleRemove}>
							<TrashIcon weight="bold" />
						</button>
					</z-tooltip>
				</div>
			{/if}
		</div>

	</div>

	<div
		class="automation-lane-track"
		class:isDisabled={!hasControl}
		data-track="lane"
		role="group"
		aria-label="{laneName} automation"
		onpointerdown={handleTrackDown}
		onpointermove={handleTrackMove}
		onpointerup={handleTrackUp}
		onpointercancel={handleTrackCancel}
		oncontextmenu={handleTrackContextMenu}
		ondblclick={handleTrackDoubleClick}
	>
		<svg class="automation-lane-grid" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
			{#each gridLines as line (line.time)}
				<line class="automation-lane-gridline" class:isLabel={line.kind === 'label'} class:isBar={line.kind === 'bar'} class:isSub={line.kind === 'sub'} x1={getGridX(line)} x2={getGridX(line)} y1="0" y2="100" />
			{/each}
		</svg>

		<div class="automation-lane-plot" bind:this={plot}>
			{#if timeSelection !== null && !isMarqueeShown}
				<span class="automation-lane-marquee isSelectedRange" style:--lane-x="{selectionLeft}%" style:--marquee-width="{selectionWidth}%"></span>
			{/if}
			{#if hasControl}
				<svg class="automation-lane-graph" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
					<path class="automation-lane-area" d={areaPath} />
					<path class="automation-lane-line" d={linePath} />
				</svg>
			{/if}

			{#if !isFolded}
				{#each visiblePoints as point (point.id)}
					<div
						class="automation-lane-point"
						class:isSelected={checkIsSelectedPoint(point)}
						class:isDragging={checkIsDraggingPoint(point)}
						data-point-id={point.id}
						style:--lane-x="{getPointX(point)}%"
						style:--lane-y="{getPointY(point)}%"
						role="slider"
						tabindex={getPointTabIndex(point)}
						aria-label={describePoint(point)}
						aria-orientation="vertical"
						aria-valuemin={0}
						aria-valuemax={1}
						aria-valuenow={point.value}
						onpointerenter={() => (hoveredPointId = point.id)}
						onpointerleave={() => (hoveredPointId = null)}
						oncontextmenu={(event) => handlePointContextMenu(event, point)}
						onkeydown={(event) => handlePointKey(event, point)}
					></div>
				{/each}

				{#if isMarqueeShown}
					<span class="automation-lane-marquee" style:--lane-x="{marqueeLeft}%" style:--marquee-width="{marqueeWidth}%"></span>
				{/if}

				{#if pillPoint !== undefined}
					<span class="value-pill automation-lane-pill" class:isBelow={isPillBelow} style:--lane-x="{getPointX(pillPoint)}%" style:--lane-y="{getPointY(pillPoint)}%">
						<span class="value-pill-time">{pillTimeLabel}</span>
						<span class="value-pill-value">{pillValueLabel}</span>
					</span>
				{/if}
			{/if}
		</div>

		<div class="automation-lane-shade isStart" style:--lane-size="{trimStartPercent}%"></div>
		<div class="automation-lane-shade isEnd" style:--lane-size="{trimEndInset}%"></div>

		{#if hasHover}
			<div class="automation-lane-hover" style:--lane-x="{hoverPercent}%"></div>
		{/if}
		{#if isPlayheadVisible}
			<div class="automation-lane-playhead" style:--lane-x="{playheadPercent}%"></div>
		{/if}

		{#if shouldShowHint}
			<span class="automation-lane-hint">Double-click to place a point · Click to set the playhead · Drag to select · Alt-drag a segment to curve</span>
		{/if}
		{#if !hasControl}
			<span class="automation-lane-empty">Choose a control in the lane settings</span>
		{/if}
	</div>

	<RowResizer rowId={props.lane.id} kind="lane" label={laneName} siblings={siblingRows} />
</div>

{#if patternMenu !== null}
	<div class="automation-pattern-menu" role="menu" aria-label="Automation patterns" bind:this={patternMenuRoot} style:--menu-x="{patternMenu.x}px" style:--menu-y="{patternMenu.y}px">
		<span class="automation-pattern-menu-title">Insert shape in selected time</span>
		<div class="automation-pattern-grid">
			<button type="button" role="menuitem" aria-label="Smooth wave" title="Smooth wave" onclick={() => handlePatternPick(AutomationPattern.wave)}><svg viewBox="0 0 40 28" aria-hidden="true"><path d="M2 25 C9 25 10 3 20 3 S31 25 38 25" /></svg></button>
			<button type="button" role="menuitem" aria-label="Triangle peak" title="Triangle peak" onclick={() => handlePatternPick(AutomationPattern.peak)}><svg viewBox="0 0 40 28" aria-hidden="true"><path d="M2 25 L20 3 L38 25" /></svg></button>
			<button type="button" role="menuitem" aria-label="Ramp down" title="Ramp down" onclick={() => handlePatternPick(AutomationPattern.rampDown)}><svg viewBox="0 0 40 28" aria-hidden="true"><path d="M2 3 L38 25" /></svg></button>
			<button type="button" role="menuitem" aria-label="Ramp up" title="Ramp up" onclick={() => handlePatternPick(AutomationPattern.rampUp)}><svg viewBox="0 0 40 28" aria-hidden="true"><path d="M2 25 L38 3" /></svg></button>
			<button type="button" role="menuitem" aria-label="Square pulse" title="Square pulse" onclick={() => handlePatternPick(AutomationPattern.square)}><svg viewBox="0 0 40 28" aria-hidden="true"><path d="M2 25 V3 H20 V25 H38" /></svg></button>
			<button type="button" role="menuitem" aria-label="Ease in" title="Ease in" onclick={() => handlePatternPick(AutomationPattern.easeIn)}><svg viewBox="0 0 40 28" aria-hidden="true"><path d="M2 25 C25 25 35 20 38 3" /></svg></button>
			<button type="button" role="menuitem" aria-label="Ease out" title="Ease out" onclick={() => handlePatternPick(AutomationPattern.easeOut)}><svg viewBox="0 0 40 28" aria-hidden="true"><path d="M2 25 C5 8 15 3 38 3" /></svg></button>
			<button type="button" role="menuitem" aria-label="Smooth rise" title="Smooth rise" onclick={() => handlePatternPick(AutomationPattern.smoothRise)}><svg viewBox="0 0 40 28" aria-hidden="true"><path d="M2 25 C13 25 13 3 38 3" /></svg></button>
			<button type="button" role="menuitem" aria-label="Smooth fall" title="Smooth fall" onclick={() => handlePatternPick(AutomationPattern.smoothFall)}><svg viewBox="0 0 40 28" aria-hidden="true"><path d="M2 3 C25 3 25 25 38 25" /></svg></button>
			<button type="button" role="menuitem" aria-label="Sharp stabs" title="Sharp stabs" onclick={() => handlePatternPick(AutomationPattern.stabs)}><svg viewBox="0 0 40 28" aria-hidden="true"><path d="M2 25 L8 3 L13 25 H19 L25 3 L30 25 H38" /></svg></button>
		</div>
	</div>
{/if}
