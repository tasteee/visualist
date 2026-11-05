<script lang="ts">
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon'
	import GridFourIcon from 'phosphor-svelte/lib/GridFourIcon'
	import RecordIcon from 'phosphor-svelte/lib/RecordIcon'
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon'
	import { recordHistory } from '../automation.svelte'
	import { PATH_WIDTH } from '../engine/automation'
	import { formatHitCount, getRoleLabel } from '../engine/hits'
	import { clamp } from '../engine/settings'
	import { getTrackSourceId } from '../engine/sources'
	import { checkIsTimeVisible, formatPreciseTime, getViewEnd, ratioToTime, snapToGrid, timeToPercent, timeToRatio } from '../engine/timeline'
	import type { GridLineT, TimelineGridT } from '../engine/timeline'
	import type { HitTrackT, TrackHitT } from '../engine/types'
	import {
		addHit,
		armTrack,
		checkIsTrackCollapsed,
		deleteHit,
		moveHit,
		removeTrack,
		renameTrack,
		selectHit,
		sources,
		toggleTrackCollapsed
	} from '../sources.svelte'
	import { app, getLiveSignals } from '../store.svelte'
	import { timeline } from '../timeline.svelte'
	import './HitLane.css'

	type HitLanePropsT = {
		track: HitTrackT
		grid: TimelineGridT
		onpattern: (trackId: string, anchor: HTMLElement) => void
	}

	type HitDragT = {
		hitId: string
		startY: number
		startStrength: number
		plotHeight: number
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

	let plot = $state<HTMLDivElement | undefined>(undefined)
	let drag = $state<HitDragT | null>(null)
	let hoveredHitId = $state<string | null>(null)

	const view = $derived(timeline.view)
	const duration = $derived(app.duration)
	const hits = $derived(props.track.hits)
	const isCollapsed = $derived(checkIsTrackCollapsed(props.track.id))
	const isArmed = $derived(sources.armedTrackId === props.track.id)
	const isGate = $derived(props.track.shape === 'gate')
	const isKick = $derived(props.track.role === 'kick')
	const isSnare = $derived(props.track.role === 'snare')
	const hitCountLabel = $derived(formatHitCount(hits.length))
	const roleLabel = $derived(getRoleLabel(props.track.role))
	const hasRole = $derived(props.track.role !== 'none')
	// The role shows as the lane's color, and in full on hover.
	const metaTitle = $derived(hasRole ? `${hitCountLabel} · ${roleLabel}` : hitCountLabel)
	const collapseLabel = $derived(isCollapsed ? `Expand ${props.track.name}` : `Collapse ${props.track.name}`)
	const armLabel = $derived(isArmed ? 'Stop tapping' : 'Arm for tapping · press T while playing')
	const isEmpty = $derived(hits.length === 0)
	const shouldShowHint = $derived(!isCollapsed && (isEmpty || isArmed))
	const hintText = $derived(isArmed ? 'Tapping · press T in time while the song plays' : 'Click to add hits · Drag to move and set strength · Double-click to delete')

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
	// leaves the edge keeps its element.
	const visibleHits = $derived.by(() => {
		const margin = view.span * 0.02
		const earliest = view.start - margin
		const latest = getViewEnd(view) + margin
		const draggingId = drag === null ? null : drag.hitId
		return hits.filter((hit) => {
			const isInWindow = hit.time + hit.length >= earliest && hit.time <= latest
			const isDragging = hit.id === draggingId
			return isInWindow || isDragging
		})
	})

	const pillHitId = $derived(drag === null ? hoveredHitId : drag.hitId)
	const pillHit = $derived(hits.find((hit) => hit.id === pillHitId))
	const pillLabel = $derived(pillHit === undefined ? '' : `${Math.round(pillHit.strength * 100)}% · ${formatPreciseTime(pillHit.time)}`)

	const getGridX = (line: GridLineT): number => timeToRatio(line.time, view) * PATH_WIDTH

	const getHitX = (hit: TrackHitT): number => timeToPercent(hit.time, view)

	const getHoldWidth = (hit: TrackHitT): number => (hit.length / view.span) * 100

	const getHitHeight = (hit: TrackHitT): number => hit.strength * 100

	const checkIsSelected = (hit: TrackHitT): boolean => sources.selectedHitId === hit.id

	const checkIsDragging = (hit: TrackHitT): boolean => drag !== null && drag.hitId === hit.id

	// Only the selected hit is in the tab order, so a dense track
	// is not hundreds of tab stops.
	const getHitTabIndex = (hit: TrackHitT): number => (checkIsSelected(hit) ? 0 : -1)

	const describeHit = (hit: TrackHitT): string => {
		const strength = Math.round(hit.strength * 100)
		return `${props.track.name} hit at ${formatPreciseTime(hit.time)}, strength ${strength}%`
	}

	const readPlotPosition = (event: PointerEvent): PlotPositionT => {
		if (plot === undefined) return { time: 0, strength: 0 }
		const bounds = plot.getBoundingClientRect()
		const xRatio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
		const yRatio = clamp((event.clientY - bounds.top) / bounds.height, 0, 1)
		const rawTime = clamp(ratioToTime(xRatio, view), 0, duration)
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

	const startDrag = (event: PointerEvent, hitId: string, startStrength: number) => {
		if (plot === undefined) return
		const track = event.currentTarget as HTMLElement
		track.setPointerCapture(event.pointerId)
		const bounds = plot.getBoundingClientRect()
		drag = { hitId, startY: event.clientY, startStrength, plotHeight: bounds.height }
		selectHit(hitId)
	}

	const startExistingDrag = (event: PointerEvent, hitId: string) => {
		const hit = findHit(hitId)
		if (hit === undefined) return
		if (event.altKey) return deleteHit(props.track.id, hitId)
		recordHistory()
		startDrag(event, hitId, hit.strength)
	}

	const startNewHit = (event: PointerEvent) => {
		const position = readPlotPosition(event)
		const strength = Math.max(MIN_NEW_STRENGTH, position.strength)
		const holdLength = isGate ? props.grid.snapStep : 0
		const hitId = addHit(props.track.id, position.time, strength, holdLength)
		if (hitId === null) return
		startDrag(event, hitId, strength)
	}

	const handleTrackDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		const canEdit = duration > 0 && !isCollapsed
		if (!isPrimaryButton || !canEdit) return
		const hitId = readHitId(event.target)
		const isOnHit = hitId !== null
		if (isOnHit) return startExistingDrag(event, hitId)
		startNewHit(event)
	}

	const handleTrackMove = (event: PointerEvent) => {
		const activeDrag = drag
		if (activeDrag === null) return
		const position = readPlotPosition(event)
		const travel = (activeDrag.startY - event.clientY) / activeDrag.plotHeight
		const strength = activeDrag.startStrength + travel
		moveHit(props.track.id, activeDrag.hitId, position.time, strength)
	}

	const handleTrackUp = () => {
		drag = null
	}

	const handleTrackDoubleClick = (event: MouseEvent) => {
		if (isCollapsed) return toggleTrackCollapsed(props.track.id)
		const hitId = readHitId(event.target)
		if (hitId === null) return
		deleteHit(props.track.id, hitId)
	}

	const handleHitContextMenu = (event: MouseEvent, hit: TrackHitT) => {
		event.preventDefault()
		deleteHit(props.track.id, hit.id)
	}

	const handleHitKey = (event: KeyboardEvent, hit: TrackHitT) => {
		const isFine = event.shiftKey
		const divider = isFine ? FINE_DIVIDER : 1
		const isDelete = event.key === 'Delete' || event.key === 'Backspace'
		if (isDelete) {
			event.preventDefault()
			return deleteHit(props.track.id, hit.id)
		}
		const timeDeltas: Partial<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 }
		const strengthDeltas: Partial<Record<string, number>> = { ArrowDown: -1, ArrowUp: 1 }
		const timeDelta = timeDeltas[event.key] ?? 0
		const strengthDelta = strengthDeltas[event.key] ?? 0
		const isArrow = timeDelta !== 0 || strengthDelta !== 0
		if (!isArrow) return
		event.preventDefault()
		event.stopPropagation()
		recordHistory()
		const nextTime = hit.time + (timeDelta * TIME_KEY_STEP) / divider
		const nextStrength = hit.strength + (strengthDelta * STRENGTH_KEY_STEP) / divider
		moveHit(props.track.id, hit.id, nextTime, nextStrength)
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

<div class="hit-lane" class:isCollapsed class:isArmed class:isKick class:isSnare>
	<div class="hit-lane-header">
		<div class="hit-lane-title">
			<button class="hit-lane-caret" type="button" aria-expanded={!isCollapsed} aria-label={collapseLabel} onclick={handleToggle}>
				<CaretRightIcon weight="bold" />
			</button>
			<span class="hit-lane-dot"></span>
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
				<span class="hit-lane-count" title={metaTitle}>{hitCountLabel}</span>
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
					oncontextmenu={(event) => handleHitContextMenu(event, hit)}
					onkeydown={(event) => handleHitKey(event, hit)}
				></div>
			{/each}

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
</div>
