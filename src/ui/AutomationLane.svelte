<script lang="ts">
	import { flushSync } from 'svelte'
	import XIcon from 'phosphor-svelte/lib/XIcon'
	import { automation, addPoint, deletePoint, movePoint, removeLane, selectPoint, setLaneControl, setPointBend } from '../automation.svelte'
	import {
		AUTOMATION_CONTROLS,
		buildAreaPath,
		buildLinePath,
		buildVertices,
		findControl,
		findSegmentStart,
		formatControlValue,
		getLiveControlValue,
		toControlValue,
		toNormalized
	} from '../engine/automation'
	import { clamp } from '../engine/settings'
	import type { AutomatableKeyT, AutomationLaneT, AutomationPointT } from '../engine/types'
	import { app } from '../store.svelte'
	import './AutomationLane.css'

	type AutomationLanePropsT = {
		lane: AutomationLaneT
		onedit: (laneId: string, pointId: string, anchor: HTMLElement) => void
	}

	type BendDragT = {
		pointId: string
		startY: number
		startBend: number
		plotHeight: number
	}

	type PointDeltaT = { time: number; value: number }

	const props: AutomationLanePropsT = $props()

	const VALUE_KEY_STEP = 0.01
	const TIME_KEY_STEP = 0.1
	const FINE_MULTIPLIER = 10
	const BEND_PER_PLOT_HEIGHT = 2

	const KEY_DELTAS: Partial<Record<string, PointDeltaT>> = {
		ArrowUp: { time: 0, value: 1 },
		ArrowDown: { time: 0, value: -1 },
		ArrowLeft: { time: -1, value: 0 },
		ArrowRight: { time: 1, value: 0 }
	}

	let plot: HTMLDivElement
	let bendDrag: BendDragT | null = null

	const control = $derived(findControl(props.lane.controlKey))
	const hasControl = $derived(control !== null)
	const duration = $derived(app.duration)
	const points = $derived(props.lane.points)
	const hasPoints = $derived(points.length > 0)

	const baseNormalized = $derived.by(() => {
		const key = props.lane.controlKey
		if (control === null || key === null) return 0
		return toNormalized(control, app.settings[key])
	})

	const vertices = $derived(buildVertices(points, duration, baseNormalized))
	const linePath = $derived(buildLinePath(vertices))
	const areaPath = $derived(buildAreaPath(vertices))

	const liveValue = $derived(getLiveControlValue(props.lane, app.settings, app.currentTime))
	const liveLabel = $derived(liveValue === null ? '—' : formatControlValue(liveValue))

	const playheadPercent = $derived(duration > 0 ? (app.currentTime / duration) * 100 : 0)
	const trimStartPercent = $derived(duration > 0 ? (app.trimStart / duration) * 100 : 0)
	const trimEndPercent = $derived(duration > 0 ? (app.trimEnd / duration) * 100 : 100)
	const trimEndInset = $derived(100 - trimEndPercent)

	const isHintLow = $derived(baseNormalized > 0.5)
	const trackLabel = $derived(control === null ? 'Automation lane' : `${control.label} automation`)

	const selectOptions = $derived.by(() => {
		const usedKeys = automation.lanes
			.filter((lane) => lane.id !== props.lane.id)
			.map((lane) => lane.controlKey)
		return AUTOMATION_CONTROLS.map((candidate) => ({
			value: candidate.key,
			label: candidate.label,
			isDisabled: usedKeys.includes(candidate.key)
		}))
	})

	const getPointX = (point: AutomationPointT): number => {
		const ratio = duration > 0 ? point.time / duration : 0
		return clamp(ratio, 0, 1) * 100
	}

	const getPointY = (point: AutomationPointT): number => (1 - point.value) * 100

	const describePoint = (point: AutomationPointT): string => {
		if (control === null) return 'Point'
		const value = formatControlValue(toControlValue(control, point.value))
		return `${control.label} ${value} at ${point.time.toFixed(2)} seconds`
	}

	const readPlotPosition = (event: PointerEvent): PointDeltaT => {
		const bounds = plot.getBoundingClientRect()
		const xRatio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
		const yRatio = clamp((event.clientY - bounds.top) / bounds.height, 0, 1)
		return { time: xRatio * duration, value: 1 - yRatio }
	}

	const findPointElement = (pointId: string): HTMLElement | null => {
		return plot.querySelector<HTMLElement>(`[data-point-id="${pointId}"]`)
	}

	const handleControlChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		setLaneControl(props.lane.id, detail.value as AutomatableKeyT)
	}

	const handleRemove = () => removeLane(props.lane.id)

	const startBendDrag = (event: PointerEvent, time: number) => {
		const startIndex = findSegmentStart(points, time)
		const isOnSegment = startIndex !== -1
		if (!isOnSegment) return
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
		element.focus()
	}

	const handleTrackDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		const canEdit = hasControl && duration > 0
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
		if (!event.altKey) return
		const bounds = plot.getBoundingClientRect()
		const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
		const startIndex = findSegmentStart(points, ratio * duration)
		const isOnSegment = startIndex !== -1
		if (!isOnSegment) return
		setPointBend(props.lane.id, points[startIndex].id, 0)
	}

	const handlePointDown = (event: PointerEvent, point: AutomationPointT) => {
		event.stopPropagation()
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		startPointDrag(event, point.id)
	}

	const handlePointMove = (event: PointerEvent, point: AutomationPointT) => {
		const element = event.currentTarget as HTMLElement
		const isDragging = element.hasPointerCapture(event.pointerId)
		if (!isDragging) return
		const position = readPlotPosition(event)
		movePoint(props.lane.id, point.id, position.time, position.value, duration)
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

	const nudgePoint = (point: AutomationPointT, delta: PointDeltaT, multiplier: number) => {
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

<div class="automation-lane">
	<div class="automation-lane-control">
		<z-select
			value={props.lane.controlKey ?? ''}
			options={selectOptions}
			placeholder="Choose control"
			aria-label="Automated control"
			onchange={handleControlChange}
		></z-select>
	</div>

	<div
		class="automation-track"
		class:isDisabled={!hasControl}
		role="group"
		aria-label={trackLabel}
		onpointerdown={handleTrackDown}
		onpointermove={handleTrackMove}
		onpointerup={handleTrackUp}
		onpointercancel={handleTrackUp}
		ondblclick={handleTrackDoubleClick}
	>
		<div class="automation-plot" bind:this={plot}>
			{#if hasControl}
				<svg class="automation-graph" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
					<line class="automation-guide" x1="0" x2="1000" y1="25" y2="25" />
					<line class="automation-guide" x1="0" x2="1000" y1="50" y2="50" />
					<line class="automation-guide" x1="0" x2="1000" y1="75" y2="75" />
					<path class="automation-area" d={areaPath} />
					<path class="automation-line" class:isIdle={!hasPoints} d={linePath} />
				</svg>
			{/if}

			{#if hasControl}
				<div class="automation-shade isStart" style:--automation-position="{trimStartPercent}%"></div>
				<div class="automation-shade isEnd" style:--automation-position="{trimEndInset}%"></div>
				<div class="automation-playhead" style:--automation-position="{playheadPercent}%"></div>
			{/if}

			{#if hasControl && !hasPoints}
				<span class="automation-hint" class:isLow={isHintLow}>Click to add a point</span>
			{/if}

			{#each points as point (point.id)}
				<div
					class="automation-point"
					class:isSelected={automation.selectedPointId === point.id}
					data-point-id={point.id}
					style:--automation-x="{getPointX(point)}%"
					style:--automation-y="{getPointY(point)}%"
					role="slider"
					tabindex="0"
					aria-label={describePoint(point)}
					aria-orientation="vertical"
					aria-valuemin={0}
					aria-valuemax={1}
					aria-valuenow={point.value}
					onpointerdown={(event) => handlePointDown(event, point)}
					onpointermove={(event) => handlePointMove(event, point)}
					ondblclick={(event) => handlePointDoubleClick(event, point)}
					oncontextmenu={(event) => handlePointContextMenu(event, point)}
					onkeydown={(event) => handlePointKey(event, point)}
					onfocus={() => selectPoint(point.id)}
				></div>
			{/each}
		</div>

		{#if !hasControl}
			<span class="automation-empty">Choose a control to automate</span>
		{/if}
	</div>

	<div class="automation-lane-meta">
		<span class="automation-value" class:isMuted={!hasControl}>{liveLabel}</span>
		<z-tooltip content="Remove lane" placement="top">
			<z-button size="sm" kind="ghost" tone="neutral" aria-label="Remove lane" onclick={handleRemove}>
				<XIcon weight="bold" />
			</z-button>
		</z-tooltip>
	</div>
</div>
