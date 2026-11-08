<script lang="ts">
	import { untrack } from 'svelte'
	import CrosshairSimpleIcon from 'phosphor-svelte/lib/CrosshairSimpleIcon'
	import MagnetStraightIcon from 'phosphor-svelte/lib/MagnetStraightIcon'
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon'
	import {
		addLayerLane,
		addModulationLane,
		automation,
		checkCanAddLayerLane,
		getLanesInGroup,
		movePoints,
		recordHistory,
		recordHistoryCoalesced,
		redo,
		revealLane,
		selectAllPoints,
		undo
	} from '../automation.svelte'
	import { MODULATION_GROUP_ID, getTargetControl } from '../engine/automation'
	import { getOutputLatency, getPlaybackTime } from '../engine/audio'
	import { snapToStep } from '../engine/impulses'
	import { clamp } from '../engine/settings'
	import { getBandSourceId } from '../engine/sources'
	import type { CompiledBandT, LayerT } from '../engine/types'
	import { buildGrid, ratioToTime, snapToGrid } from '../engine/timeline'
	import { checkIsClipInSelection, layerStore, moveLayer, moveLayerToFrontIndex, removeLayer, toggleLayerVisible } from '../layers.svelte'
	import type { SelectedClipRefT } from '../layers.svelte'
	import { help } from '../help.svelte'
	import { rowInspector } from '../rowInspector.svelte'
	import type { RowRefT } from '../rowLayout.svelte'
	import { checkHasSelection, clearSelection, deleteSelection, pickClipsInBox, pickEmitterTrack, pickLane, pickLayer, readModifiers } from '../selection.svelte'
	import { copySelectedLayers, cutSelectedLayers, duplicateSelectedLayers, nudgeSelectedLayerTimes, pasteLayers, sliceSelectedLayers, toggleSelectedLayersActive } from '../layerEdit.svelte'
	import { nudgeSelectedLayers } from '../stage.svelte'
	import {
		addEmptyTrack,
		getCompiledSources,
		moveImpulses,
		recordTap,
		selectAllImpulses,
		sources,
		toggleTriggersCollapsed
	} from '../sources.svelte'
	import { getRowColor } from '../appearance.svelte'
	import { pickColorForId } from '../engine/palette'
	import type { ColorNameT } from '../engine/palette'
	import { openAddLayerMenu, openGridMenu } from '../timelineMenus.svelte'
	import { app, getAnalysis, getAudioLayerBuffer, goToBeginning, seekTo, toggleLoop, toggleMetronome } from '../store.svelte'
	import { getVideoDuration } from '../engine/video'
	import type { ImpulseMoveT } from '../sources.svelte'
	import {
		DEFAULT_HEADER_WIDTH,
		MAX_HEADER_WIDTH,
		fitView,
		followPlayhead,
		panBy,
		resetDockHeight,
		resetHeaderWidth,
		setDockHeight,
		setHeaderWidth,
		setHoverTime,
		timeline,
		toggleFollowing,
		toggleSnapping,
		zoomAt,
		zoomIn,
		zoomOut
	} from '../timeline.svelte'
	import AudioClip from './AudioClip.svelte'
	import AutomationLane from './AutomationLane.svelte'
	import AutomationPopover from './AutomationPopover.svelte'
	import BandLane from './BandLane.svelte'
	import ImpulseLane from './ImpulseLane.svelte'
	import ImpulsePopover from './ImpulsePopover.svelte'
	import TimelineLayer from './TimelineLayer.svelte'
	import LayerClip from './LayerClip.svelte'
	import OverviewBar from './OverviewBar.svelte'
	import PatternPopover from './PatternPopover.svelte'
	import RowInspector from './RowInspector.svelte'
	import TimelineMenus from './TimelineMenus.svelte'
	import TimeRuler from './TimeRuler.svelte'
	import TransportBar from './TransportBar.svelte'
	import { checkIsTextEntry, checkIsTyping } from './keyboard'
	import './EditorDock.css'
	import { RepeatIcon } from 'phosphor-svelte'
	import { press } from './press'

	type PointEditorT = {
		laneId: string
		pointId: string
		anchorX: number
		anchorY: number
	}

	type ImpulseEditorT = {
		trackId: string
		impulseId: string
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

	type MarqueeDragT = {
		startClientX: number
		startClientY: number
		currentClientX: number
		currentClientY: number
		isAdditive: boolean
		initialClips: SelectedClipRefT[]
		hasMoved: boolean
		clickedTrack: HTMLElement | null
	}

	type MarqueeRectT = {
		left: number
		top: number
		width: number
		height: number
	}

	const DOCK_TOP_CLEARANCE_PX = 140
	const WHEEL_LINE_PX = 16
	const WHEEL_ZOOM_RATE = 0.0025
	const PINCH_ZOOM_RATE = 0.01
	const RESIZE_KEY_PX = 24
	const REORDER_START_PX = 4
	const MARQUEE_START_PX = 3
	const ZOOMING_ZONES = ['ruler', 'overview']

	let dock: HTMLDivElement
	let frame: HTMLDivElement
	let lanesElement: HTMLDivElement
	let editor = $state<PointEditorT | null>(null)
	let impulseEditor = $state<ImpulseEditorT | null>(null)
	let patternEditor = $state<PatternEditorT | null>(null)
	let resizeDrag: ResizeDragT | null = null
	let reorder = $state<ReorderDragT | null>(null)
	let dropMarker = $state<DropMarkerT | null>(null)
	let marqueeDrag: MarqueeDragT | null = null
	let marqueeRect = $state<MarqueeRectT | null>(null)
	let shouldSkipSelect = false
	const loopLabel = $derived(app.isLoopEnabled ? 'Loop on (L)' : 'Loop off (L)')
	const canPlay = $derived(app.hasAudio && !app.isRecording && !app.isAnalyzing)

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

	const isModulation = $derived(timeline.mode === 'modulation')
	const followLabel = $derived(timeline.isFollowing ? 'Following playhead (F)' : 'Follow playhead (F)')
	const snapLabel = $derived(timeline.isSnapping ? 'Snapping to the grid (S) · hold Shift to move freely' : 'Snap to the grid (S)')

	const trackCount = $derived(sources.tracks.length)
	const bandCount = $derived(sources.bands.length)
	const hasTriggers = $derived(trackCount > 0 || bandCount > 0)
	const isTriggersCollapsed = $derived(sources.isTriggersCollapsed)
	const compiledBands = $derived(getCompiledSources().bands)

	const getLayerColor = (layer: LayerT): ColorNameT => getRowColor(layer.id, pickColorForId(layer.id))

	// Front to back, matching the Layers panel.
	const layersFrontToBack = $derived([...layerStore.layers].reverse() as LayerT[])
	const layerIdsInOrder = $derived(layersFrontToBack.map((layer) => layer.id))
	const trackIdsInOrder = $derived([...sources.tracks.map((track) => track.id), ...sources.bands.map((band) => band.id)])
	const getLaneIdsInGroup = (groupId: string): string[] => getLanesInGroup(groupId).map((lane) => lane.id)

	// A layer's siblings are every other layer.
	const layerSiblings = $derived(layerIdsInOrder.map((layerId): RowRefT => ({ kind: 'layer', id: layerId })))

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

	// The editor and the workspace share the window's height, so the
	// editor can rise until the workspace is down to a sliver.
	const getMaxDockHeight = (): number => window.innerHeight - DOCK_TOP_CLEARANCE_PX

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

	// One drag widens every header. A click with no drag opens
	// them to the widest, or closes them back to the default.
	type HeaderResizeDragT = {
		startX: number
		startWidth: number
		hasMoved: boolean
	}

	let headerResizeDrag: HeaderResizeDragT | null = null

	const handleHeaderResizeDown = (event: PointerEvent) => {
		const handle = event.currentTarget as HTMLElement
		handle.setPointerCapture(event.pointerId)
		headerResizeDrag = { startX: event.clientX, startWidth: timeline.headerWidth, hasMoved: false }
	}

	const handleHeaderResizeMove = (event: PointerEvent) => {
		const drag = headerResizeDrag
		if (drag === null) return
		const travel = event.clientX - drag.startX
		const hasStarted = drag.hasMoved || Math.abs(travel) > 3
		if (!hasStarted) return
		drag.hasMoved = true
		setHeaderWidth(drag.startWidth + travel)
	}

	const handleHeaderResizeUp = () => {
		const drag = headerResizeDrag
		headerResizeDrag = null
		if (drag === null || drag.hasMoved) return
		const isWide = timeline.headerWidth > DEFAULT_HEADER_WIDTH
		setHeaderWidth(isWide ? DEFAULT_HEADER_WIDTH : MAX_HEADER_WIDTH)
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

	// ---- Timeline marquee select & click-to-deselect --------

	const checkIsInteractiveTarget = (target: EventTarget | null): boolean => {
		if (!(target instanceof Element)) return false
		return target.closest('.layer-clip, .audio-clip, [data-clip-control], .timeline-layer-header, .timeline-layer-resize, button') !== null
	}

	const updateMarqueeSelection = (activeMarquee: MarqueeDragT) => {
		const lanesBounds = lanesElement.getBoundingClientRect()
		const minClientX = Math.min(activeMarquee.startClientX, activeMarquee.currentClientX)
		const maxClientX = Math.max(activeMarquee.startClientX, activeMarquee.currentClientX)
		const minClientY = Math.min(activeMarquee.startClientY, activeMarquee.currentClientY)
		const maxClientY = Math.max(activeMarquee.startClientY, activeMarquee.currentClientY)

		marqueeRect = {
			left: minClientX - lanesBounds.left + lanesElement.scrollLeft,
			top: minClientY - lanesBounds.top + lanesElement.scrollTop,
			width: maxClientX - minClientX,
			height: maxClientY - minClientY
		}

		const clipElements = Array.from(lanesElement.querySelectorAll<HTMLElement>('.layer-clip[data-layer-id][data-clip-id], .audio-clip[data-layer-id][data-clip-id]'))
		const hits: SelectedClipRefT[] = []
		for (const clipElement of clipElements) {
			const rect = clipElement.getBoundingClientRect()
			const isIntersecting = rect.right >= minClientX && rect.left <= maxClientX && rect.bottom >= minClientY && rect.top <= maxClientY
			if (!isIntersecting) continue
			const layerId = clipElement.dataset.layerId
			const clipId = clipElement.dataset.clipId
			if (layerId === undefined || clipId === undefined) continue
			hits.push({ layerId, clipId })
		}
		const baseClips = activeMarquee.isAdditive ? activeMarquee.initialClips : []
		pickClipsInBox([...baseClips, ...hits], false)
	}

	const handleLanesPointerDown = (event: PointerEvent) => {
		if (isModulation || event.button !== 0) return
		if (checkIsInteractiveTarget(event.target)) return
		const modifiers = readModifiers(event)
		const isAdditive = modifiers.isToggle || modifiers.isRange
		const clickedTrack = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-track="layer"]') : null
		lanesElement.setPointerCapture(event.pointerId)
		marqueeDrag = {
			startClientX: event.clientX,
			startClientY: event.clientY,
			currentClientX: event.clientX,
			currentClientY: event.clientY,
			isAdditive,
			initialClips: [...layerStore.selectedClips],
			hasMoved: false,
			clickedTrack
		}
	}

	const handleLanesPointerMove = (event: PointerEvent) => {
		const activeMarquee = marqueeDrag
		if (activeMarquee === null) return
		activeMarquee.currentClientX = event.clientX
		activeMarquee.currentClientY = event.clientY
		const travel = Math.abs(event.clientX - activeMarquee.startClientX) + Math.abs(event.clientY - activeMarquee.startClientY)
		const hasStarted = activeMarquee.hasMoved || travel >= MARQUEE_START_PX
		if (!hasStarted) return
		activeMarquee.hasMoved = true
		updateMarqueeSelection(activeMarquee)
	}

	const handleLanesPointerUp = (event: PointerEvent) => {
		const activeMarquee = marqueeDrag
		marqueeDrag = null
		marqueeRect = null
		if (activeMarquee === null || activeMarquee.hasMoved) return
		if (!activeMarquee.isAdditive) clearSelection()
		if (activeMarquee.clickedTrack !== null) {
			const bounds = activeMarquee.clickedTrack.getBoundingClientRect()
			const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
			const rawTime = clamp(ratioToTime(ratio, timeline.view), 0, app.duration)
			const shouldSnap = timeline.isSnapping && !event.shiftKey
			seekTo(shouldSnap ? snapToGrid(rawTime, grid) : rawTime)
		}
	}

	const handleLanesPointerCancel = () => {
		marqueeDrag = null
		marqueeRect = null
	}

	const checkIsTapKey = (event: KeyboardEvent): boolean => {
		const isPlainKey = !event.metaKey && !event.ctrlKey && !event.altKey
		const isT = event.key.toLowerCase() === 't'
		return isPlainKey && isT && !event.repeat
	}

	const handleKeyDown = (event: KeyboardEvent) => {
		const isTap = checkIsTapKey(event) && !checkIsTextEntry(event)
		if (isTap) return handleTap()
		// Ctrl+E slices the selected clips at the playhead. It is claimed
		// even from a button, so the browser's search bar never opens.
		const isSlice = (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'e'
		if (isSlice && !checkIsTextEntry(event)) {
			event.preventDefault()
			if (!event.repeat) sliceSelectedLayers(app.currentTime, getFileLength)
			return
		}
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
		if (isCommand && !event.shiftKey && !event.altKey) {
			const didHandle = handleClipboardKey(event, key)
			if (didHandle) return
		}
		if (key.startsWith('arrow')) return handleArrowKey(event, key)
		if (isCommand || event.altKey) return
		if (key === '=' || key === '+') return zoomIn()
		if (key === '-' || key === '_') return zoomOut()
		if (key === '0') return handleZeroKey(event)
		if (key === 'f') return toggleFollowing()
		if (key === 's') return toggleSnapping()
		if (key === 'l') return toggleLoop()
		if (key === 'm') return toggleMetronome()
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

	// Cmd/Ctrl with C, V or D acts on the selected clips or layers.
	const handleClipboardKey = (event: KeyboardEvent, key: string): boolean => {
		if (key === 'c') {
			const didCopy = copySelectedLayers(getFileLength)
			if (didCopy) event.preventDefault()
			return didCopy
		}
		if (key === 'v') {
			const didPaste = pasteLayers(app.currentTime, getFileLength)
			if (didPaste) event.preventDefault()
			return didPaste
		}
		if (key === 'x') {
			const didCut = cutSelectedLayers(getFileLength)
			if (didCut) event.preventDefault()
			return didCut
		}
		if (key === 'd') {
			const didDuplicate = duplicateSelectedLayers(getFileLength)
			if (didDuplicate) event.preventDefault()
			return didDuplicate
		}
		return false
	}

	// How long a clip's file is, for audio and for video.
	const getFileLength = (layerId: string): number => {
		const audioLength = getAudioLayerBuffer(layerId)?.duration
		if (audioLength !== undefined) return audioLength
		const layer = layerStore.layers.find((candidate) => candidate.id === layerId)
		return getVideoDuration(layer?.assetId ?? null)
	}

	// Zero deactivates the selected clips, like Ableton. With nothing
	// selected it fits the timeline.
	const handleZeroKey = (event: KeyboardEvent) => {
		const didToggle = toggleSelectedLayersActive()
		if (didToggle) return event.preventDefault()
		fitView()
	}

	const handleDeleteKey = (event: KeyboardEvent) => {
		const didDelete = deleteSelection()
		if (didDelete) event.preventDefault()
	}

	const handleSelectAllKey = (event: KeyboardEvent) => {
		const selectedTrackId = sources.impulseSelection.trackId
		const hasImpulses = selectedTrackId !== null && sources.impulseSelection.impulseIds.length > 0
		if (hasImpulses && selectedTrackId !== null) {
			event.preventDefault()
			return selectAllImpulses(selectedTrackId)
		}
		const pointLaneId = automation.selectedPointLaneId
		const hasPoints = pointLaneId !== null && automation.selectedPointIds.length > 0
		if (!hasPoints || pointLaneId === null) return
		event.preventDefault()
		selectAllPoints(pointLaneId)
	}

	// ---- Arrow keys ----------------------------------------
	//
	// With impulses or points selected, arrows nudge them. With
	// clips or layers selected, Left/Right nudge clip times and
	// Up/Down nudge layer position. With nothing selected, Left
	// and Right step the playhead by one visible grid division.

	const POINT_VALUE_STEP = 0.05
	const IMPULSE_STEP = 0.01
	const IMPULSE_FINE_STEP = 0.001
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
		const trackId = sources.impulseSelection.trackId
		const impulseIds = sources.impulseSelection.impulseIds
		const track = sources.tracks.find((candidate) => candidate.id === trackId)
		const hasImpulses = track !== undefined && impulseIds.length > 0
		if (!hasImpulses) return false
		const timeDelta = direction.horizontal * getTimeNudge(event)
		const strengthStep = event.shiftKey ? IMPULSE_FINE_STEP : IMPULSE_STEP
		const strengthDelta = direction.vertical * strengthStep
		const selected = track.impulses.filter((impulse) => impulseIds.includes(impulse.id))
		const moves: ImpulseMoveT[] = selected.map((impulse) => ({ impulseId: impulse.id, time: impulse.time + timeDelta, strength: impulse.strength + strengthDelta }))
		recordHistoryCoalesced('nudge-impulses')
		moveImpulses(track.id, moves)
		return true
	}

	const nudgePoints = (event: KeyboardEvent, direction: ArrowDirectionT): boolean => {
		const laneId = automation.selectedPointLaneId
		const lane = automation.lanes.find((candidate) => candidate.id === laneId)
		const pointIds = automation.selectedPointIds
		const hasPoints = lane !== undefined && pointIds.length > 0
		if (!hasPoints) return false
		const timeDelta = direction.horizontal * getTimeNudge(event)
		// A point steps by its control's own step, in the control's units.
		const control = getTargetControl(lane.target, layerStore.layers as LayerT[])
		const controlStep = control === null ? POINT_VALUE_STEP : control.step / (control.max - control.min)
		const valueStep = event.shiftKey ? controlStep / 10 : controlStep
		const valueDelta = direction.vertical * valueStep
		const selected = lane.points.filter((point) => pointIds.includes(point.id))
		const moves = selected.map((point) => ({ pointId: point.id, time: point.time + timeDelta, value: point.value + valueDelta }))
		const orderedMoves = timeDelta > 0 ? [...moves].reverse() : moves
		recordHistoryCoalesced('nudge-points')
		movePoints(lane.id, orderedMoves, app.duration)
		return true
	}

	// Left and right move the selected clips along the timeline, one
	// visible marker at a time. Up and down move selected layers on the stage.
	const nudgeLayers = (event: KeyboardEvent, direction: ArrowDirectionT): boolean => {
		const hasClips = layerStore.selectedClips.length > 0
		const hasLayers = layerStore.selectedLayerIds.length > 0
		if (!hasClips && !hasLayers) return false
		if (direction.horizontal !== 0) return nudgeLayerTimes(event, direction.horizontal)
		if (!hasLayers) return false
		const step = event.shiftKey ? FINE_LAYER_STEP_PERCENT : LAYER_STEP_PERCENT
		return nudgeSelectedLayers(0, -direction.vertical * step)
	}

	const nudgeLayerTimes = (event: KeyboardEvent, horizontal: number): boolean => {
		const isSnapped = timeline.isSnapping && !event.shiftKey
		const step = isSnapped ? grid.snapStep : FINE_TIME_STEP
		const gridOffset = isSnapped ? grid.beatOffset : null
		return nudgeSelectedLayerTimes({ direction: horizontal, step, gridOffset }, getFileLength)
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

	const handleTriggersToggle = () => {
		recordHistory()
		toggleTriggersCollapsed()
	}

	// Only a clip in selectedClips is lit. Selecting its layer does not
	// select its clips.
	const checkIsClipSelected = (layer: LayerT, clipId: string): boolean => {
		return checkIsClipInSelection(layer.id, clipId)
	}

	const handleAddLayerClick = (event: Event) => {
		openAddLayerMenu(event.currentTarget as HTMLElement)
	}

	const handleAddTrack = () => {
		const trackId = addEmptyTrack()
		pickEmitterTrack(trackId)
	}

	const handleAddModulationLane = () => {
		const laneId = addModulationLane()
		pickLane(laneId, getLaneIdsInGroup(MODULATION_GROUP_ID), { isRange: false, isToggle: false })
		revealLane(laneId)
	}


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

	const openImpulseEditor = (trackId: string, impulseId: string, anchor: HTMLElement) => {
		const dockBounds = dock.getBoundingClientRect()
		const anchorBounds = anchor.getBoundingClientRect()
		const anchorX = anchorBounds.left + anchorBounds.width / 2 - dockBounds.left
		const anchorY = anchorBounds.top - dockBounds.top
		impulseEditor = { trackId, impulseId, anchorX, anchorY }
	}

	const closeImpulseEditor = () => {
		impulseEditor = null
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

<div class="editor-dock" bind:this={dock} style:--editor-header-width="{timeline.headerWidth}px">
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
		<button
			class="editor-header-resize"
			type="button"
			tabindex="-1"
			aria-label="Resize headers. Drag, click to open or close, double-click to reset."
			title="Drag to resize every header · click to open or close"
			onpointerdown={handleHeaderResizeDown}
			onpointermove={handleHeaderResizeMove}
			onpointerup={handleHeaderResizeUp}
			onpointercancel={handleHeaderResizeUp}
			ondblclick={resetHeaderWidth}
		></button>
		<z-row class="editor-row isRuler">
			<z-row style="height: 38px; padding-left: var(--spacing-3); padding-right: var(--spacing-2)" aligns-y="center" aligns-x="evenly" gap="3">
			<z-tooltip content={loopLabel} placement="right">
				<z-button isIcon size="sm" kind={app.isLoopEnabled ? 'soft' : 'ghost'} tone="neutral" isDisabled={!canPlay} aria-pressed={app.isLoopEnabled} aria-label="Loop" {...press(toggleLoop)}>
					<RepeatIcon weight="bold" />
				</z-button>
			</z-tooltip>
			<z-tooltip content="Add a layer" placement="bottom">
					<z-button isIcon size="sm" kind="soft" aria-label="Add a layer" onclick={handleAddLayerClick}>
						<PlusIcon weight="bold" />
					</z-button>
				</z-tooltip>
				<z-tooltip content={snapLabel} placement="bottom">
					<z-button isIcon size="sm" kind={timeline.isSnapping ? 'soft' : 'ghost'} tone="neutral" aria-pressed={timeline.isSnapping} aria-label="Snap to grid" onclick={toggleSnapping}>
						<MagnetStraightIcon weight="bold" />
					</z-button>
				</z-tooltip>
				<z-tooltip content={followLabel} placement="bottom">
					<z-button isIcon size="sm" kind={timeline.isFollowing ? 'soft' : 'ghost'} tone="neutral" aria-pressed={timeline.isFollowing} aria-label="Follow playhead" onclick={toggleFollowing}>
						<CrosshairSimpleIcon weight="bold" />
					</z-button>
				</z-tooltip>
			</z-row>
			<TimeRuler {grid} />
		</z-row>

		<div
			class="editor-lanes"
			bind:this={lanesElement}
			role="presentation"
			oncontextmenu={handleLanesContextMenu}
			onpointerdown={handleLanesPointerDown}
			onpointermove={handleLanesPointerMove}
			onpointerup={handleLanesPointerUp}
			onpointercancel={handleLanesPointerCancel}
		>
			{#if isModulation}
				<div class="editor-mod-row">
					<div class="editor-mod-header">
						<span class="editor-mod-title">Emitters</span>
						<z-tooltip content="Add an emitter lane" placement="top" openDelay={300}>
							<z-button isIcon size="sm" kind="ghost" tone="neutral" aria-label="Add an emitter lane" onclick={handleAddTrack}>
								<PlusIcon weight="bold" />
							</z-button>
						</z-tooltip>
					</div>
				</div>
				{#each sources.tracks as track (track.id)}
					<ImpulseLane {track} {grid} siblingTrackIds={trackIdsInOrder} onpattern={openPatternEditor} onedit={openImpulseEditor} />
				{/each}
				{#each sources.bands as band (band.id)}
					<BandLane {band} compiled={findCompiledBand(band.id)} {grid} siblingTrackIds={trackIdsInOrder} />
				{/each}

				<div class="editor-mod-row">
					<div class="editor-mod-header">
						<span class="editor-mod-title">Automation</span>
						<z-tooltip content="Add an automation modulator lane" placement="top" openDelay={300}>
							<z-button isIcon size="sm" kind="ghost" tone="neutral" aria-label="Add an automation modulator lane" onclick={handleAddModulationLane}>
								<PlusIcon weight="bold" />
							</z-button>
						</z-tooltip>
					</div>
				</div>
				{#each getLanesInGroup(MODULATION_GROUP_ID) as lane (lane.id)}
					<AutomationLane {lane} {grid} siblingLaneIds={getLaneIdsInGroup(MODULATION_GROUP_ID)} onedit={openEditor} />
				{/each}

				{#each layersFrontToBack as layer (layer.id)}
					{@const laneIds = getLaneIdsInGroup(layer.id)}
					{@const canAddLane = layer.kind !== 'audio' && checkCanAddLayerLane(layer.id)}
					<div class="editor-mod-row" data-tone={getLayerColor(layer)}>
						<div class="editor-mod-header">
							<span class="editor-mod-swatch"></span>
							<span class="editor-mod-title">{layer.name}</span>
							<z-tooltip content={canAddLane ? `Automate a ${layer.name} control` : `${layer.name} has no more controls to automate`} placement="top" openDelay={300}>
								<z-button isIcon size="sm" kind="ghost" tone="neutral" aria-label="Automate a {layer.name} control" isDisabled={!canAddLane} onclick={() => handleAddLayerLane(layer.id)}>
									<PlusIcon weight="bold" />
								</z-button>
							</z-tooltip>
						</div>
					</div>
					<div class="editor-layer-lanes" role="presentation">
						{#each getLanesInGroup(layer.id) as lane (lane.id)}
							<AutomationLane {lane} {grid} isNested siblingLaneIds={laneIds} onedit={openEditor} />
						{/each}
					</div>
				{/each}
			{:else}
			{#each layersFrontToBack as layer (layer.id)}
				{@const isSelected = layerStore.selectedLayerIds.includes(layer.id)}
				<TimelineLayer
					kind={layer.kind}
					rowId={layer.id}
					color={getLayerColor(layer)}
					title={layer.name}
					{grid}
					{isSelected}
					siblings={layerSiblings.filter((sibling) => sibling.id !== layer.id)}
					isHidden={!layer.isVisible}
					ondelete={() => removeLayer(layer.id)}
					onselect={(event) => handleGroupSelect(layer.id, event)}
					ontogglevisible={() => toggleLayerVisible(layer.id)}
					layerId={layer.id}
					isDragSource={checkIsDragSource(layer.id)}
					dropEdge={getDropEdge(layer.id)}
					onreorderstart={(event) => handleReorderStart(layer.id, event)}
					onreorderkey={(direction) => moveLayer(layer.id, direction)}
				>
					{#snippet track()}
						{#each layer.clips as clip (clip.id)}
							{#if layer.kind === 'audio'}
								<AudioClip {layer} {clip} {grid} isSelected={checkIsClipSelected(layer, clip.id)} />
							{:else}
								<LayerClip {layer} {clip} {grid} isSelected={checkIsClipSelected(layer, clip.id)} />
							{/if}
						{/each}
					{/snippet}
				</TimelineLayer>
			{/each}
			{/if}

			{#if marqueeRect !== null}
				<div
					class="editor-marquee"
					style="left: {marqueeRect.left}px; top: {marqueeRect.top}px; width: {marqueeRect.width}px; height: {marqueeRect.height}px;"
				></div>
			{/if}

			<div class="editor-add-row">
				<div class="editor-add-cell"></div>
				<div class="editor-add-fill">
					<span class="editor-add-hint">{isModulation ? 'Press + on a layer to automate one of its controls, or add an emitter to trigger them.' : 'Drag a clip to move it. Drag across empty space to marquee-select multiple clips. Press Ctrl+E to slice at the playhead. Press 0 to turn selected clips off.'}</span>
				</div>
			</div>
		</div>

		<div class="editor-row isOverview">
			<div class="editor-overview-label">
				<span class="editor-help">{help.text}</span>
			</div>
			<OverviewBar {grid} />
		</div>
	</div>

	<TimelineMenus />

	{#if patternEditor !== null}
		<PatternPopover trackId={patternEditor.trackId} anchorX={patternEditor.anchorX} anchorY={patternEditor.anchorY} onclose={closePatternEditor} />
	{/if}

	<RowInspector />

	{#if impulseEditor !== null}
		<ImpulsePopover trackId={impulseEditor.trackId} impulseId={impulseEditor.impulseId} anchorX={impulseEditor.anchorX} anchorY={impulseEditor.anchorY} onclose={closeImpulseEditor} />
	{/if}

	{#if editor !== null}
		<AutomationPopover laneId={editor.laneId} pointId={editor.pointId} anchorX={editor.anchorX} anchorY={editor.anchorY} onclose={closeEditor} />
	{/if}
</div>
