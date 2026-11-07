<script lang="ts">
	import { untrack } from 'svelte'
	import CaretDoubleDownIcon from 'phosphor-svelte/lib/CaretDoubleDownIcon'
	import CaretDoubleUpIcon from 'phosphor-svelte/lib/CaretDoubleUpIcon'
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon'
	import {
		addLayerLane,
		addSettingLane,
		automation,
		checkAreAllCollapsed,
		checkCanAddLayerLane,
		checkCanAddSettingLane,
		checkIsGroupCollapsed,
		getLanesInGroup,
		movePoints,
		recordHistory,
		recordHistoryCoalesced,
		redo,
		revealLane,
		selectAllPoints,
		toggleAllCollapsed,
		undo
	} from '../automation.svelte'
	import { GLOBAL_GROUP_ID } from '../engine/automation'
	import { getOutputLatency, getPlaybackTime } from '../engine/audio'
	import { snapToStep } from '../engine/hits'
	import { getBandSourceId } from '../engine/sources'
	import type { CompiledBandT } from '../engine/types'
	import { buildGrid, ratioToTime } from '../engine/timeline'
	import type { LayerT } from '../engine/types'
	import { showInspectorTab } from '../inspector.svelte'
	import { layerStore, moveLayer, moveLayerToFrontIndex, toggleLayerVisible } from '../layers.svelte'
	import { rowInspector } from '../rowInspector.svelte'
	import { toggleRowFolded } from '../rowLayout.svelte'
	import type { RowRefT } from '../rowLayout.svelte'
	import { checkHasSelection, clearSelection, deleteSelection, pickLayer, readModifiers } from '../selection.svelte'
	import { nudgeSelectedLayers } from '../stage.svelte'
	import {
		addEmptyTrack,
		getCompiledSources,
		moveHits,
		recordTap,
		selectAllHits,
		sources,
		toggleTriggersCollapsed
	} from '../sources.svelte'
	import { AUDIO_ROW_ID, getRowColor } from '../appearance.svelte'
	import { pickColorForId } from '../engine/palette'
	import type { ColorNameT } from '../engine/palette'
	import { openGridMenu } from '../timelineMenus.svelte'
	import { app, getAnalysis, goToBeginning, seekTo, toggleLoop } from '../store.svelte'
	import type { HitMoveT } from '../sources.svelte'
	import {
		MAX_DOCK_SHARE,
		fitView,
		followPlayhead,
		panBy,
		resetDockHeight,
		setDockHeight,
		setHoverTime,
		timeline,
		toggleFollowing,
		toggleSnapping,
		zoomAt,
		zoomIn,
		zoomOut
	} from '../timeline.svelte'
	import AutomationLane from './AutomationLane.svelte'
	import AutomationPopover from './AutomationPopover.svelte'
	import BandLane from './BandLane.svelte'
	import HitLane from './HitLane.svelte'
	import TimelineLayer from './TimelineLayer.svelte'
	import LayerClip from './LayerClip.svelte'
	import OverviewBar from './OverviewBar.svelte'
	import PatternPopover from './PatternPopover.svelte'
	import RowInspector from './RowInspector.svelte'
	import TimelineMenus from './TimelineMenus.svelte'
	import TimeRuler from './TimeRuler.svelte'
	import TransportBar from './TransportBar.svelte'
	import WaveformTrack from './WaveformTrack.svelte'
	import { checkIsTextEntry, checkIsTyping } from './keyboard'
	import './EditorDock.css'

	type PointEditorT = {
		laneId: string
		pointId: string
		anchorX: number
		anchorY: number
	}

	type PatternEditorT = {
		trackId: string
		anchorX: number
		anchorY: number
	}

	type ReorderDragT = {
		layerId: string
		startY: number
		isActive: boolean
		frontIndex: number
	}

	type DropMarkerT = {
		layerId: string
		edge: 'before' | 'after'
	}

	type ResizeDragT = {
		startY: number
		startHeight: number
	}

	const WHEEL_LINE_PX = 16
	const WHEEL_ZOOM_RATE = 0.0025
	const PINCH_ZOOM_RATE = 0.01
	const RESIZE_KEY_PX = 24
	const REORDER_START_PX = 4
	const ZOOMING_ZONES = ['ruler', 'wave', 'overview']

	let dock: HTMLDivElement
	let frame: HTMLDivElement
	let editor = $state<PointEditorT | null>(null)
	let patternEditor = $state<PatternEditorT | null>(null)
	let resizeDrag: ResizeDragT | null = null
	let reorder = $state<ReorderDragT | null>(null)
	let dropMarker = $state<DropMarkerT | null>(null)
	let shouldSkipSelect = false

	const analysis = $derived(getAnalysis())

	const grid = $derived(
		buildGrid({
			view: timeline.view,
			duration: app.duration,
			widthPx: timeline.trackWidth,
			bpm: analysis.bpm,
			beatOffset: analysis.beatOffset,
			division: timeline.gridDivision,
			isTriplet: timeline.isTriplet
		})
	)

	const laneCount = $derived(automation.lanes.length)
	const hasLanes = $derived(laneCount > 0)

	const canAddSettingLane = $derived(checkCanAddSettingLane())
	const areAllCollapsed = $derived(checkAreAllCollapsed())
	const collapseAllLabel = $derived(areAllCollapsed ? 'Expand all lanes' : 'Collapse all lanes')
	const addLaneLabel = $derived(canAddSettingLane ? 'Add a scene and post lane' : 'Every scene and post control already has a lane')
	const globalLanes = $derived(getLanesInGroup(GLOBAL_GROUP_ID))
	const isGlobalCollapsed = $derived(checkIsGroupCollapsed(GLOBAL_GROUP_ID))

	const trackCount = $derived(sources.tracks.length)
	const bandCount = $derived(sources.bands.length)
	const hasTriggers = $derived(trackCount > 0 || bandCount > 0)
	const isTriggersCollapsed = $derived(sources.isTriggersCollapsed)
	const compiledBands = $derived(getCompiledSources().bands)

	const audioColor = $derived(getRowColor(AUDIO_ROW_ID, 'amber'))
	const globalColor = $derived(getRowColor(GLOBAL_GROUP_ID, 'slate'))

	const getLayerColor = (layer: LayerT): ColorNameT => getRowColor(layer.id, pickColorForId(layer.id))

	// Front to back, matching the Layers panel.
	const layersFrontToBack = $derived([...layerStore.layers].reverse() as LayerT[])
	const laneCountLabel = $derived(String(laneCount))
	const layerIdsInOrder = $derived(layersFrontToBack.map((layer) => layer.id))
	const trackIdsInOrder = $derived([...sources.tracks.map((track) => track.id), ...sources.bands.map((band) => band.id)])
	const globalLaneIds = $derived(globalLanes.map((lane) => lane.id))
	const getLaneIdsInGroup = (groupId: string): string[] => getLanesInGroup(groupId).map((lane) => lane.id)

	// A layer's siblings are every other layer.
	const layerSiblings = $derived(layerIdsInOrder.map((layerId): RowRefT => ({ kind: 'layer', id: layerId })))
	const songName = $derived(app.fileName === '' ? 'Untitled' : app.fileName)

	// A new song opens fully zoomed out.
	$effect(() => {
		void app.duration
		untrack(fitView)
	})

	$effect(() => {
		const time = app.currentTime
		const shouldFollow = app.isPlaying && timeline.isFollowing
		if (!shouldFollow) return
		untrack(() => followPlayhead(time))
	})

	const getMaxDockHeight = (): number => {
		const workspace = dock.parentElement
		if (workspace === null) return timeline.dockHeight
		return workspace.clientHeight * MAX_DOCK_SHARE
	}

	const handleResizeDown = (event: PointerEvent) => {
		const handle = event.currentTarget as HTMLElement
		handle.setPointerCapture(event.pointerId)
		resizeDrag = { startY: event.clientY, startHeight: timeline.dockHeight }
	}

	const handleResizeMove = (event: PointerEvent) => {
		if (resizeDrag === null) return
		const travel = resizeDrag.startY - event.clientY
		setDockHeight(resizeDrag.startHeight + travel, getMaxDockHeight())
	}

	const handleResizeUp = () => {
		resizeDrag = null
	}

	const handleResizeReset = () => resetDockHeight(getMaxDockHeight())

	const handleResizeKey = (event: KeyboardEvent) => {
		const isUp = event.key === 'ArrowUp'
		const isDown = event.key === 'ArrowDown'
		if (!isUp && !isDown) return
		event.preventDefault()
		const direction = isUp ? 1 : -1
		setDockHeight(timeline.dockHeight + direction * RESIZE_KEY_PX, getMaxDockHeight())
	}

	const findTrack = (target: EventTarget | null): HTMLElement | null => {
		const isElement = target instanceof Element
		if (!isElement) return null
		return target.closest<HTMLElement>('[data-track]')
	}

	const readTrackTime = (track: HTMLElement, clientX: number): number => {
		const bounds = track.getBoundingClientRect()
		const ratio = (clientX - bounds.left) / bounds.width
		const isOverview = track.dataset.track === 'overview'
		if (isOverview) return ratio * app.duration
		return ratioToTime(ratio, timeline.view)
	}

	const readWheelPixels = (event: WheelEvent, delta: number): number => {
		const isLineMode = event.deltaMode === WheelEvent.DOM_DELTA_LINE
		return isLineMode ? delta * WHEEL_LINE_PX : delta
	}

	// Pinch and Ctrl/Cmd-wheel zoom anywhere. Horizontal swipes
	// and Shift-wheel scroll. Plain wheel zooms over the ruler,
	// waveform and overview, and scrolls the lanes everywhere else.
	const handleWheel = (event: WheelEvent) => {
		const track = findTrack(event.target)
		const deltaX = readWheelPixels(event, event.deltaX)
		const deltaY = readWheelPixels(event, event.deltaY)
		const isZoomGesture = event.ctrlKey || event.metaKey
		const isHorizontal = event.shiftKey || Math.abs(deltaX) > Math.abs(deltaY)
		const centerTime = timeline.view.start + timeline.view.span / 2
		const anchorTime = track === null ? centerTime : readTrackTime(track, event.clientX)
		const anchorInView = track?.dataset.track === 'overview' ? centerTime : anchorTime

		if (isZoomGesture) {
			event.preventDefault()
			zoomAt(Math.exp(deltaY * PINCH_ZOOM_RATE), anchorInView)
			return
		}

		if (isHorizontal) {
			event.preventDefault()
			const horizontalPixels = event.shiftKey && deltaX === 0 ? deltaY : deltaX
			const secondsPerPixel = timeline.view.span / Math.max(1, timeline.trackWidth)
			panBy(horizontalPixels * secondsPerPixel)
			return
		}

		const zone = track === null ? '' : (track.dataset.track ?? '')
		const isZoomingZone = ZOOMING_ZONES.includes(zone)
		if (!isZoomingZone) return
		event.preventDefault()
		zoomAt(Math.exp(deltaY * WHEEL_ZOOM_RATE), anchorInView)
	}

	$effect(() => {
		frame.addEventListener('wheel', handleWheel, { passive: false })
		return () => frame.removeEventListener('wheel', handleWheel)
	})

	const handleFramePointerMove = (event: PointerEvent) => {
		const track = findTrack(event.target)
		const isTimelineTrack = track !== null && track.dataset.track !== 'overview'
		if (!isTimelineTrack) return setHoverTime(null)
		const time = readTrackTime(track, event.clientX)
		const isInSong = time >= 0 && time <= app.duration
		setHoverTime(isInSong ? time : null)
	}

	const handleFramePointerLeave = () => setHoverTime(null)

	const checkIsTapKey = (event: KeyboardEvent): boolean => {
		const isPlainKey = !event.metaKey && !event.ctrlKey && !event.altKey
		const isT = event.key.toLowerCase() === 't'
		return isPlainKey && isT && !event.repeat
	}

	const handleKeyDown = (event: KeyboardEvent) => {
		const isTap = checkIsTapKey(event) && !checkIsTextEntry(event)
		if (isTap) return handleTap()
		if (checkIsTyping(event)) return
		const isHandled = event.defaultPrevented
		if (isHandled) return
		const isCommand = event.metaKey || event.ctrlKey
		const key = event.key.toLowerCase()
		const isUndo = isCommand && key === 'z' && !event.shiftKey
		const isRedo = (isCommand && key === 'z' && event.shiftKey) || (isCommand && key === 'y')
		if (isUndo) {
			event.preventDefault()
			return undo()
		}
		if (isRedo) {
			event.preventDefault()
			return redo()
		}
		if (key === 'escape') return handleEscapeKey(event)
		const isDeleteKey = key === 'delete' || key === 'backspace'
		if (isDeleteKey) return handleDeleteKey(event)
		const isSelectAll = isCommand && key === 'a'
		if (isSelectAll) return handleSelectAllKey(event)
		if (key.startsWith('arrow')) return handleArrowKey(event, key)
		if (isCommand || event.altKey) return
		if (key === '=' || key === '+') return zoomIn()
		if (key === '-' || key === '_') return zoomOut()
		if (key === '0') return fitView()
		if (key === 'f') return toggleFollowing()
		if (key === 's') return toggleSnapping()
		if (key === 'l') return toggleLoop()
		if (key === 'home') return goToBeginning()
	}

	// The inspector popover closes first, on its own Escape. The
	// next one clears the selection.
	const handleEscapeKey = (event: KeyboardEvent) => {
		const isInspectorOpen = rowInspector.open !== null
		if (isInspectorOpen) return
		const hadSelection = checkHasSelection()
		if (!hadSelection) return
		event.preventDefault()
		clearSelection()
	}

	const handleDeleteKey = (event: KeyboardEvent) => {
		const didDelete = deleteSelection()
		if (didDelete) event.preventDefault()
	}

	const handleSelectAllKey = (event: KeyboardEvent) => {
		const selectedTrackId = sources.hitSelection.trackId
		const hasImpulses = selectedTrackId !== null && sources.hitSelection.hitIds.length > 0
		if (hasImpulses && selectedTrackId !== null) {
			event.preventDefault()
			return selectAllHits(selectedTrackId)
		}
		const pointLaneId = automation.selectedPointLaneId
		const hasPoints = pointLaneId !== null && automation.selectedPointIds.length > 0
		if (!hasPoints || pointLaneId === null) return
		event.preventDefault()
		selectAllPoints(pointLaneId)
	}

	// ---- Arrow keys ----------------------------------------
	//
	// With impulses or points selected, arrows nudge them. With a
	// stage layer selected, they nudge its position (a channel
	// that is automated stays put). With nothing selected, Left
	// and Right step the playhead by one visible grid division.

	const POINT_VALUE_STEP = 0.05
	const FINE_VALUE_STEP = 0.01
	const FINE_TIME_STEP = 0.01
	const LAYER_STEP_PERCENT = 1
	const FINE_LAYER_STEP_PERCENT = 0.1

	type ArrowDirectionT = {
		horizontal: number
		vertical: number
	}

	const readArrowDirection = (key: string): ArrowDirectionT => {
		const horizontal = key === 'arrowright' ? 1 : key === 'arrowleft' ? -1 : 0
		const vertical = key === 'arrowup' ? 1 : key === 'arrowdown' ? -1 : 0
		return { horizontal, vertical }
	}

	// Snap on: a whole grid division. Shift, or snap off: a
	// fine step.
	const getTimeNudge = (event: KeyboardEvent): number => {
		const isSnapped = timeline.isSnapping && !event.shiftKey
		return isSnapped ? grid.snapStep : FINE_TIME_STEP
	}

	const nudgeImpulses = (event: KeyboardEvent, direction: ArrowDirectionT): boolean => {
		const trackId = sources.hitSelection.trackId
		const hitIds = sources.hitSelection.hitIds
		const track = sources.tracks.find((candidate) => candidate.id === trackId)
		const hasImpulses = track !== undefined && hitIds.length > 0
		if (!hasImpulses) return false
		const timeDelta = direction.horizontal * getTimeNudge(event)
		const strengthStep = event.shiftKey ? FINE_VALUE_STEP : POINT_VALUE_STEP
		const strengthDelta = direction.vertical * strengthStep
		const selected = track.hits.filter((hit) => hitIds.includes(hit.id))
		const moves: HitMoveT[] = selected.map((hit) => ({ hitId: hit.id, time: hit.time + timeDelta, strength: hit.strength + strengthDelta }))
		recordHistoryCoalesced('nudge-impulses')
		moveHits(track.id, moves)
		return true
	}

	const nudgePoints = (event: KeyboardEvent, direction: ArrowDirectionT): boolean => {
		const laneId = automation.selectedPointLaneId
		const lane = automation.lanes.find((candidate) => candidate.id === laneId)
		const pointIds = automation.selectedPointIds
		const hasPoints = lane !== undefined && pointIds.length > 0
		if (!hasPoints) return false
		const timeDelta = direction.horizontal * getTimeNudge(event)
		const valueStep = event.shiftKey ? FINE_VALUE_STEP : POINT_VALUE_STEP
		const valueDelta = direction.vertical * valueStep
		const selected = lane.points.filter((point) => pointIds.includes(point.id))
		const moves = selected.map((point) => ({ pointId: point.id, time: point.time + timeDelta, value: point.value + valueDelta }))
		const orderedMoves = timeDelta > 0 ? [...moves].reverse() : moves
		recordHistoryCoalesced('nudge-points')
		movePoints(lane.id, orderedMoves, app.duration)
		return true
	}

	const nudgeLayers = (event: KeyboardEvent, direction: ArrowDirectionT): boolean => {
		const step = event.shiftKey ? FINE_LAYER_STEP_PERCENT : LAYER_STEP_PERCENT
		return nudgeSelectedLayers(direction.horizontal * step, -direction.vertical * step)
	}

	// One visible grid division left or right of the playhead.
	const stepPlayhead = (direction: number) => {
		const stepSeconds = grid.snapStep
		const stepsFromOffset = (app.currentTime - grid.beatOffset) / stepSeconds
		const epsilon = 1e-6
		const nextStep = direction > 0 ? Math.floor(stepsFromOffset + epsilon) + 1 : Math.ceil(stepsFromOffset - epsilon) - 1
		seekTo(grid.beatOffset + nextStep * stepSeconds)
	}

	const handleArrowKey = (event: KeyboardEvent, key: string) => {
		event.preventDefault()
		const direction = readArrowDirection(key)
		if (nudgeImpulses(event, direction)) return
		if (nudgePoints(event, direction)) return
		if (nudgeLayers(event, direction)) return
		if (direction.horizontal !== 0) stepPlayhead(direction.horizontal)
	}

	// Right-click on empty lane space opens the grid menu. Rows
	// that use right-click for themselves cancel it first.
	const handleLanesContextMenu = (event: MouseEvent) => {
		if (event.defaultPrevented) return
		const track = findTrack(event.target)
		if (track === null) return
		event.preventDefault()
		openGridMenu(event.clientX, event.clientY)
	}

	// People tap to what they hear, which is the clock minus
	// the speakers' delay.
	const handleTap = () => {
		const isArmed = sources.armedTrackId !== null
		if (!isArmed || !app.isPlaying) return
		const tapTime = getPlaybackTime() - getOutputLatency()
		const tempo = { bpm: analysis.bpm, beatOffset: analysis.beatOffset }
		recordTap(tapTime, tempo, snapToStep)
	}

	// The caret folds a layer's lanes. With the primary modifier,
	// every other layer is set to the same state.
	const handleLayerToggle = (layerId: string, event: MouseEvent) => {
		const isPrimary = event.metaKey || event.ctrlKey
		const siblings = isPrimary ? layerSiblings.filter((sibling) => sibling.id !== layerId) : []
		toggleRowFolded({ kind: 'layer', id: layerId }, siblings)
	}

	const handleTriggersToggle = () => {
		recordHistory()
		toggleTriggersCollapsed()
	}

	const handleAddTrack = () => {
		addEmptyTrack()
	}

	const openSourcesPanel = () => showInspectorTab('sources')

	const openPatternEditor = (trackId: string, anchor: HTMLElement) => {
		const dockBounds = dock.getBoundingClientRect()
		const anchorBounds = anchor.getBoundingClientRect()
		const anchorX = anchorBounds.left + anchorBounds.width / 2 - dockBounds.left
		const anchorY = anchorBounds.top - dockBounds.top
		patternEditor = { trackId, anchorX, anchorY }
	}

	const closePatternEditor = () => {
		patternEditor = null
	}

	const findCompiledBand = (bandId: string): CompiledBandT | undefined => {
		const sourceId = getBandSourceId(bandId)
		return compiledBands.find((band) => band.sourceId === sourceId)
	}

	const openEditor = (laneId: string, pointId: string, anchor: HTMLElement) => {
		const dockBounds = dock.getBoundingClientRect()
		const anchorBounds = anchor.getBoundingClientRect()
		const anchorX = anchorBounds.left + anchorBounds.width / 2 - dockBounds.left
		const anchorY = anchorBounds.top - dockBounds.top
		editor = { laneId, pointId, anchorX, anchorY }
	}

	const closeEditor = () => {
		editor = null
	}

	const handleAddSettingLane = () => {
		const laneId = addSettingLane()
		if (laneId === null) return
		revealLane(laneId)
	}

	const handleAddLayerLane = (layerId: string) => {
		const laneId = addLayerLane(layerId)
		if (laneId === null) return
		revealLane(laneId)
	}

	// ---- Reordering layers by dragging their header ----------

	const readOtherGroups = (layerId: string): HTMLElement[] => {
		const groups = Array.from(frame.querySelectorAll<HTMLElement>('[data-layer-group]'))
		return groups.filter((group) => group.dataset.layerGroup !== layerId)
	}

	const checkIsAbovePointer = (group: HTMLElement, clientY: number): boolean => {
		const bounds = group.getBoundingClientRect()
		const middle = bounds.top + bounds.height / 2
		return middle < clientY
	}

	// The landing spot among the other layers, front to back,
	// and the edge of the neighbor that shows the drop rule.
	const updateDropTarget = (activeReorder: ReorderDragT, clientY: number) => {
		const others = readOtherGroups(activeReorder.layerId)
		const groupsAbove = others.filter((group) => checkIsAbovePointer(group, clientY))
		const frontIndex = groupsAbove.length
		activeReorder.frontIndex = frontIndex
		const hasNeighborBelow = frontIndex < others.length
		const neighbor = hasNeighborBelow ? others[frontIndex] : others[others.length - 1]
		if (neighbor === undefined) return
		const neighborId = neighbor.dataset.layerGroup ?? ''
		const edge = hasNeighborBelow ? 'before' : 'after'
		dropMarker = { layerId: neighborId, edge }
	}

	const handleReorderMove = (event: PointerEvent) => {
		const activeReorder = reorder
		if (activeReorder === null) return
		const travel = Math.abs(event.clientY - activeReorder.startY)
		const hasStarted = activeReorder.isActive || travel >= REORDER_START_PX
		if (!hasStarted) return
		activeReorder.isActive = true
		updateDropTarget(activeReorder, event.clientY)
	}

	const stopReorder = () => {
		window.removeEventListener('pointermove', handleReorderMove)
		window.removeEventListener('pointerup', handleReorderUp)
		window.removeEventListener('pointercancel', stopReorder)
		reorder = null
		dropMarker = null
	}

	// The click that ends a drag must not also open the layer,
	// so it is skipped once, then the flag clears.
	const handleReorderUp = () => {
		const activeReorder = reorder
		const wasDragging = activeReorder !== null && activeReorder.isActive
		if (wasDragging) {
			moveLayerToFrontIndex(activeReorder.layerId, activeReorder.frontIndex)
			shouldSkipSelect = true
			setTimeout(() => (shouldSkipSelect = false), 0)
		}
		stopReorder()
	}

	const handleReorderStart = (layerId: string, event: PointerEvent) => {
		reorder = { layerId, startY: event.clientY, isActive: false, frontIndex: 0 }
		window.addEventListener('pointermove', handleReorderMove)
		window.addEventListener('pointerup', handleReorderUp)
		window.addEventListener('pointercancel', stopReorder)
	}

	const handleGroupSelect = (layerId: string, event: PointerEvent) => {
		if (shouldSkipSelect) return
		pickLayer(layerId, layerIdsInOrder, readModifiers(event))
	}

	const getDropEdge = (layerId: string): 'before' | 'after' | null => {
		if (dropMarker === null) return null
		const isTarget = dropMarker.layerId === layerId
		if (!isTarget) return null
		return dropMarker.edge
	}

	const checkIsDragSource = (layerId: string): boolean => {
		if (reorder === null) return false
		return reorder.isActive && reorder.layerId === layerId
	}

</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="editor-dock" bind:this={dock} style:--editor-dock-height="{timeline.dockHeight}px">
	<button
		class="editor-resize"
		type="button"
		aria-label="Resize editor. Use arrow keys, or double-click to reset."
		title="Drag to resize · double-click to reset"
		onpointerdown={handleResizeDown}
		onpointermove={handleResizeMove}
		onpointerup={handleResizeUp}
		onpointercancel={handleResizeUp}
		ondblclick={handleResizeReset}
		onkeydown={handleResizeKey}
	></button>

	<TransportBar />

	<div class="editor-frame" id="editor-timeline" bind:this={frame} role="presentation" onpointermove={handleFramePointerMove} onpointerleave={handleFramePointerLeave}>
		<div class="editor-row isRuler">
			<div class="editor-corner">
				<span class="editor-eyebrow">Automation</span>
				<span class="editor-count">{laneCountLabel}</span>
				<div class="editor-corner-actions">
					<z-tooltip content={collapseAllLabel} placement="top">
						<button class="editor-icon" type="button" aria-label={collapseAllLabel} disabled={!hasLanes} onclick={toggleAllCollapsed}>
							{#if areAllCollapsed}
								<CaretDoubleDownIcon weight="bold" />
							{:else}
								<CaretDoubleUpIcon weight="bold" />
							{/if}
						</button>
					</z-tooltip>
					<z-tooltip content={addLaneLabel} placement="top">
						<button class="editor-icon" type="button" aria-label={addLaneLabel} disabled={!canAddSettingLane} onclick={handleAddSettingLane}>
							<PlusIcon weight="bold" />
						</button>
					</z-tooltip>
				</div>
			</div>
			<TimeRuler {grid} />
		</div>

		<div class="editor-lanes" role="presentation" oncontextmenu={handleLanesContextMenu}>
			<TimelineLayer
				kind="audio"
				rowId={AUDIO_ROW_ID}
				color={audioColor}
				title={songName}
				{grid}
				isCollapsed={isTriggersCollapsed}
				canAddLane
				addLabel="Add a hit track"
				ontoggle={handleTriggersToggle}
				onadd={handleAddTrack}
>
				{#snippet track()}
					<WaveformTrack {grid} />
				{/snippet}
			</TimelineLayer>
			{#if !isTriggersCollapsed && hasTriggers}
				{#each sources.tracks as track (track.id)}
					<HitLane {track} {grid} siblingTrackIds={trackIdsInOrder} onpattern={openPatternEditor} />
				{/each}
				{#each sources.bands as band (band.id)}
					<BandLane {band} compiled={findCompiledBand(band.id)} {grid} siblingTrackIds={trackIdsInOrder} />
				{/each}
			{/if}

			<TimelineLayer
				kind="global"
				rowId={GLOBAL_GROUP_ID}
				color={globalColor}
				title="Scene and post"
				{grid}
				isCollapsed={isGlobalCollapsed}
				canAddLane={canAddSettingLane}
				ontoggle={(event) => handleLayerToggle(GLOBAL_GROUP_ID, event)}
				onadd={handleAddSettingLane}
			/>
			{#if !isGlobalCollapsed}
				{#each globalLanes as lane (lane.id)}
					<AutomationLane {lane} {grid} isNested siblingLaneIds={globalLaneIds} onedit={openEditor} />
				{/each}
			{/if}

			{#each layersFrontToBack as layer (layer.id)}
				{@const isCollapsed = checkIsGroupCollapsed(layer.id)}
				{@const isSelected = layerStore.selectedLayerIds.includes(layer.id)}
				<TimelineLayer
					kind={layer.kind}
					rowId={layer.id}
					color={getLayerColor(layer)}
					title={layer.name}
					{grid}
					{isCollapsed}
					{isSelected}
					siblings={layerSiblings.filter((sibling) => sibling.id !== layer.id)}
					isHidden={!layer.isVisible}
					canAddLane={checkCanAddLayerLane(layer.id)}
					ontoggle={(event) => handleLayerToggle(layer.id, event)}
					onadd={() => handleAddLayerLane(layer.id)}
					onselect={(event) => handleGroupSelect(layer.id, event)}
					ontogglevisible={() => toggleLayerVisible(layer.id)}
					layerId={layer.id}
					isDragSource={checkIsDragSource(layer.id)}
					dropEdge={getDropEdge(layer.id)}
					onreorderstart={(event) => handleReorderStart(layer.id, event)}
					onreorderkey={(direction) => moveLayer(layer.id, direction)}
				>
					{#snippet track()}
						<LayerClip {layer} {grid} {isSelected} />
					{/snippet}
				</TimelineLayer>
				{#if !isCollapsed}
					{@const laneIds = getLaneIdsInGroup(layer.id)}
					<div class="editor-layer-lanes" role="presentation">
						{#each getLanesInGroup(layer.id) as lane (lane.id)}
							<AutomationLane {lane} {grid} isNested siblingLaneIds={laneIds} onedit={openEditor} />
						{/each}
					</div>
				{/if}
			{/each}

			<div class="editor-add-row">
				<div class="editor-add-cell"></div>
				<div class="editor-add-fill">
					<span class="editor-add-hint">Drag a layer's bar to set when it shows. Press + on any row to automate one of its controls.</span>
				</div>
			</div>
		</div>

		<div class="editor-row isOverview">
			<div class="editor-overview-label">
				<span class="editor-eyebrow">Overview</span>
			</div>
			<OverviewBar />
		</div>
	</div>

	<TimelineMenus />

	{#if patternEditor !== null}
		<PatternPopover trackId={patternEditor.trackId} anchorX={patternEditor.anchorX} anchorY={patternEditor.anchorY} onclose={closePatternEditor} />
	{/if}

	<RowInspector />

	{#if editor !== null}
		<AutomationPopover laneId={editor.laneId} pointId={editor.pointId} anchorX={editor.anchorX} anchorY={editor.anchorY} onclose={closeEditor} />
	{/if}
</div>
