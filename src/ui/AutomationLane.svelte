<script lang="ts">
	import { flushSync } from 'svelte'
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon'
	import EraserIcon from 'phosphor-svelte/lib/EraserIcon'
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon'
	import {
		automation,
		addPoint,
		checkIsLaneCollapsed,
		deletePoint,
		movePoint,
		recordHistory,
		removeLane,
		resetLane,
		selectPoint,
		setLaneControl,
		setPointBend,
		toggleLaneCollapsed
	} from '../automation.svelte'
	import {
		AUTOMATION_CONTROLS,
		PATH_WIDTH,
		buildAreaPath,
		buildLinePath,
		buildVertices,
		findControl,
		findSegmentStart,
		formatControlValue,
		getControlTone,
		getLiveControlValue,
		toControlValue,
		toNormalized
	} from '../engine/automation'
	import { clamp } from '../engine/settings'
	import { checkIsTimeVisible, formatPreciseTime, getViewEnd, ratioToTime, snapToGrid, timeToPercent, timeToRatio } from '../engine/timeline'
	import type { GridLineT, TimelineGridT } from '../engine/timeline'
	import type { AutomatableKeyT, AutomationLaneT, AutomationPointT } from '../engine/types'
	import { app } from '../store.svelte'
	import { timeline } from '../timeline.svelte'
	import './AutomationLane.css'

	type AutomationLanePropsT = {
		lane: AutomationLaneT
		grid: TimelineGridT
		onedit: (laneId: string, pointId: string, anchor: HTMLElement) => void
	}

	type BendDragT = {
		pointId: string
		startY: number
		startBend: number
		plotHeight: number
	}

	type PlotPositionT = { time: number; value: number }

	const props: AutomationLanePropsT = $props()

	const VALUE_KEY_STEP = 0.01
	const TIME_KEY_STEP = 0.1
	const FINE_MULTIPLIER = 10
	const BEND_PER_PLOT_HEIGHT = 2
	const PILL_FLIP_VALUE = 0.62

	const KEY_DELTAS: Partial<Record<string, PlotPositionT>> = {
		ArrowUp: { time: 0, value: 1 },
		ArrowDown: { time: 0, value: -1 },
		ArrowLeft: { time: -1, value: 0 },
		ArrowRight: { time: 1, value: 0 }
	}

	let root: HTMLDivElement
	let plot = $state<HTMLDivElement | undefined>(undefined)
	let bendDrag: BendDragT | null = null
	let draggingPointId = $state<string | null>(null)
	let hoveredPointId = $state<string | null>(null)

	const control = $derived(findControl(props.lane.controlKey))
	const hasControl = $derived(control !== null)
	const duration = $derived(app.duration)
	const view = $derived(timeline.view)
	const points = $derived(props.lane.points)
	const pointCount = $derived(points.length)
	const isCollapsed = $derived(checkIsLaneCollapsed(props.lane.id))
	const toneClass = $derived(`isTone${getControlTone(props.lane.controlKey)}`)
	const controlLabel = $derived(control === null ? 'No control' : control.label)
	const pointCountLabel = $derived(pointCount === 1 ? '1 point' : `${pointCount} points`)
	const collapseLabel = $derived(isCollapsed ? `Expand ${controlLabel}` : `Collapse ${controlLabel}`)
	const hasSelectedPoint = $derived(points.some((point) => point.id === automation.selectedPointId))
	const shouldShowHint = $derived(hasControl && pointCount <= 1 && !isCollapsed)

	const baseNormalized = $derived.by(() => {
		const key = props.lane.controlKey
		if (control === null || key === null) return 0
		return toNormalized(control, app.settings[key])
	})

	const vertices = $derived(buildVertices(points, view, baseNormalized))
	const linePath = $derived(buildLinePath(vertices))
	const areaPath = $derived(buildAreaPath(vertices))

	const liveValue = $derived(getLiveControlValue(props.lane, app.settings, app.currentTime))
	const liveLabel = $derived(liveValue === null ? '—' : formatControlValue(liveValue))

	const gridLines = $derived(props.grid.lines.filter((line) => line.kind !== 'sub'))
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
		return points.filter((point) => {
			const isInWindow = point.time >= earliest && point.time <= latest
			const isActive = point.id === draggingPointId
			return isInWindow || isActive
		})
	})

	const pillPointId = $derived(draggingPointId ?? hoveredPointId)
	const pillPoint = $derived(points.find((point) => point.id === pillPointId))

	const pillLabel = $derived.by(() => {
		if (pillPoint === undefined || control === null) return ''
		const value = formatControlValue(toControlValue(control, pillPoint.value))
		return `${value} · ${formatPreciseTime(pillPoint.time)}`
	})

	const isPillBelow = $derived(pillPoint !== undefined && pillPoint.value > PILL_FLIP_VALUE)

	const selectOptions = $derived.by(() => {
		const otherLanes = automation.lanes.filter((lane) => lane.id !== props.lane.id)
		const usedKeys = otherLanes.map((lane) => lane.controlKey)
		return AUTOMATION_CONTROLS.map((candidate) => ({
			value: candidate.key,
			label: candidate.label,
			isDisabled: usedKeys.includes(candidate.key)
		}))
	})

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

	const readPlotPosition = (event: PointerEvent): PlotPositionT => {
		if (plot === undefined) return { time: 0, value: 0 }
		const bounds = plot.getBoundingClientRect()
		const xRatio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
		const yRatio = clamp((event.clientY - bounds.top) / bounds.height, 0, 1)
		const rawTime = clamp(ratioToTime(xRatio, view), 0, duration)
		const shouldSnap = timeline.isSnapping && !event.shiftKey
		const snappedTime = shouldSnap ? clamp(snapToGrid(rawTime, props.grid), 0, duration) : rawTime
		return { time: snappedTime, value: 1 - yRatio }
	}

	const findPointElement = (pointId: string): HTMLElement | null => {
		if (plot === undefined) return null
		return plot.querySelector<HTMLElement>(`[data-point-id="${pointId}"]`)
	}

	const handleControlChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		setLaneControl(props.lane.id, detail.value as AutomatableKeyT)
	}

	const handleRemove = () => removeLane(props.lane.id)

	const handleReset = () => resetLane(props.lane.id)

	const handleToggle = () => toggleLaneCollapsed(props.lane.id)

	const startBendDrag = (event: PointerEvent, time: number) => {
		const startIndex = findSegmentStart(points, time)
		const isOnSegment = startIndex !== -1
		if (!isOnSegment || plot === undefined) return
		recordHistory()
		const point = points[startIndex]
		const bounds = plot.getBoundingClientRect()
		bendDrag = { pointId: point.id, startY: event.clientY, startBend: point.bend, plotHeight: bounds.height }
		const track = event.currentTarget as HTMLElement
		track.setPointerCapture(event.pointerId)
	}

	const startPointDrag = (event: PointerEvent, pointId: string) => {
		selectPoint(pointId)
		flushSync()
		const element = findPointElement(pointId)
		if (element === null) return
		element.setPointerCapture(event.pointerId)
		element.focus({ preventScroll: true })
		draggingPointId = pointId
	}

	const handleTrackDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		const canEdit = hasControl && duration > 0 && !isCollapsed
		if (!isPrimaryButton || !canEdit) return
		const position = readPlotPosition(event)
		if (event.altKey) return startBendDrag(event, position.time)
		const pointId = addPoint(props.lane.id, position.time, position.value)
		if (pointId === null) return
		startPointDrag(event, pointId)
	}

	const handleTrackMove = (event: PointerEvent) => {
		if (bendDrag === null) return
		const travel = (bendDrag.startY - event.clientY) / bendDrag.plotHeight
		const bend = bendDrag.startBend + travel * BEND_PER_PLOT_HEIGHT
		setPointBend(props.lane.id, bendDrag.pointId, bend)
	}

	const handleTrackUp = () => {
		bendDrag = null
	}

	const handleTrackDoubleClick = (event: MouseEvent) => {
		if (isCollapsed) return handleToggle()
		if (!event.altKey || plot === undefined) return
		const bounds = plot.getBoundingClientRect()
		const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
		const startIndex = findSegmentStart(points, ratioToTime(ratio, view))
		const isOnSegment = startIndex !== -1
		if (!isOnSegment) return
		recordHistory()
		setPointBend(props.lane.id, points[startIndex].id, 0)
	}

	const handlePointDown = (event: PointerEvent, point: AutomationPointT) => {
		event.stopPropagation()
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		recordHistory()
		startPointDrag(event, point.id)
	}

	const handlePointMove = (event: PointerEvent, point: AutomationPointT) => {
		const element = event.currentTarget as HTMLElement
		const isDragging = element.hasPointerCapture(event.pointerId)
		if (!isDragging) return
		const position = readPlotPosition(event)
		movePoint(props.lane.id, point.id, position.time, position.value, duration)
	}

	const handlePointUp = () => {
		draggingPointId = null
	}

	const handlePointDoubleClick = (event: MouseEvent, point: AutomationPointT) => {
		event.stopPropagation()
		deletePoint(props.lane.id, point.id)
	}

	const handlePointContextMenu = (event: MouseEvent, point: AutomationPointT) => {
		event.preventDefault()
		event.stopPropagation()
		selectPoint(point.id)
		const element = event.currentTarget as HTMLElement
		props.onedit(props.lane.id, point.id, element)
	}

	const nudgePoint = (point: AutomationPointT, delta: PlotPositionT, multiplier: number) => {
		const time = point.time + delta.time * TIME_KEY_STEP * multiplier
		const value = point.value + delta.value * VALUE_KEY_STEP * multiplier
		movePoint(props.lane.id, point.id, time, value, duration)
	}

	const handlePointKey = (event: KeyboardEvent, point: AutomationPointT) => {
		const element = event.currentTarget as HTMLElement
		const multiplier = event.shiftKey ? FINE_MULTIPLIER : 1
		const delta = KEY_DELTAS[event.key]
		const isArrow = delta !== undefined
		if (isArrow) {
			event.preventDefault()
			event.stopPropagation()
			recordHistory()
			nudgePoint(point, delta, multiplier)
			return
		}
		const isDelete = event.key === 'Delete' || event.key === 'Backspace'
		if (isDelete) {
			event.preventDefault()
			deletePoint(props.lane.id, point.id)
			return
		}
		if (event.key === 'Enter') props.onedit(props.lane.id, point.id, element)
		if (event.key === 'Escape') {
			selectPoint(null)
			element.blur()
		}
	}
</script>

<div class="automation-lane {toneClass}" class:isCollapsed class:isActive={hasSelectedPoint} class:isFlashing bind:this={root}>
	<div class="automation-lane-header">
		<div class="automation-lane-title">
			<button class="automation-lane-caret" type="button" aria-expanded={!isCollapsed} aria-label={collapseLabel} onclick={handleToggle}>
				<CaretRightIcon weight="bold" />
			</button>
			<span class="automation-lane-dot"></span>
			{#if isCollapsed}
				<span class="automation-lane-name">{controlLabel}</span>
				<span class="automation-lane-value isCompact">{liveLabel}</span>
			{:else}
				<z-select
					class="automation-lane-select"
					size="sm"
					value={props.lane.controlKey ?? ''}
					options={selectOptions}
					placeholder="Choose control"
					aria-label="Automated control"
					onchange={handleControlChange}
				></z-select>
			{/if}
		</div>

		{#if !isCollapsed}
			<div class="automation-lane-meta">
				<span class="automation-lane-value">{liveLabel}</span>
				<span class="automation-lane-count">{pointCountLabel}</span>
				<div class="automation-lane-actions">
					<z-tooltip content="Reset lane" placement="top">
						<button class="automation-lane-action" type="button" aria-label="Reset lane" disabled={pointCount <= 1} onclick={handleReset}>
							<EraserIcon weight="bold" />
						</button>
					</z-tooltip>
					<z-tooltip content="Remove lane" placement="top">
						<button class="automation-lane-action isDanger" type="button" aria-label="Remove lane" onclick={handleRemove}>
							<TrashIcon weight="bold" />
						</button>
					</z-tooltip>
				</div>
			</div>
		{/if}
	</div>

	<div
		class="automation-lane-track"
		class:isDisabled={!hasControl}
		data-track="lane"
		role="group"
		aria-label="{controlLabel} automation"
		onpointerdown={handleTrackDown}
		onpointermove={handleTrackMove}
		onpointerup={handleTrackUp}
		onpointercancel={handleTrackUp}
		ondblclick={handleTrackDoubleClick}
	>
		<svg class="automation-lane-grid" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
			{#each gridLines as line (line.time)}
				<line class="automation-lane-gridline" class:isLabel={line.kind === 'label'} class:isBar={line.kind === 'bar'} x1={getGridX(line)} x2={getGridX(line)} y1="0" y2="100" />
			{/each}
		</svg>

		<div class="automation-lane-plot" bind:this={plot}>
			{#if hasControl}
				<svg class="automation-lane-graph" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
					<path class="automation-lane-area" d={areaPath} />
					<path class="automation-lane-line" d={linePath} />
				</svg>
			{/if}

			{#if !isCollapsed}
				{#each visiblePoints as point (point.id)}
					<div
						class="automation-lane-point"
						class:isSelected={automation.selectedPointId === point.id}
						class:isDragging={draggingPointId === point.id}
						data-point-id={point.id}
						style:--lane-x="{getPointX(point)}%"
						style:--lane-y="{getPointY(point)}%"
						role="slider"
						tabindex="0"
						aria-label={describePoint(point)}
						aria-orientation="vertical"
						aria-valuemin={0}
						aria-valuemax={1}
						aria-valuenow={point.value}
						onpointerdown={(event) => handlePointDown(event, point)}
						onpointermove={(event) => handlePointMove(event, point)}
						onpointerup={handlePointUp}
						onpointercancel={handlePointUp}
						onpointerenter={() => (hoveredPointId = point.id)}
						onpointerleave={() => (hoveredPointId = null)}
						ondblclick={(event) => handlePointDoubleClick(event, point)}
						oncontextmenu={(event) => handlePointContextMenu(event, point)}
						onkeydown={(event) => handlePointKey(event, point)}
						onfocus={() => selectPoint(point.id)}
					></div>
				{/each}

				{#if pillPoint !== undefined}
					<span class="automation-lane-pill" class:isBelow={isPillBelow} style:--lane-x="{getPointX(pillPoint)}%" style:--lane-y="{getPointY(pillPoint)}%">{pillLabel}</span>
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
			<span class="automation-lane-hint">Click to add points · Drag to shape · Alt-drag a segment to curve · Right-click to type a value</span>
		{/if}
		{#if !hasControl}
			<span class="automation-lane-empty">Choose a control to automate</span>
		{/if}
	</div>
</div>
