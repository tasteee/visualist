<script lang="ts">
	import { untrack } from 'svelte'
	import CaretDoubleDownIcon from 'phosphor-svelte/lib/CaretDoubleDownIcon'
	import CaretDoubleUpIcon from 'phosphor-svelte/lib/CaretDoubleUpIcon'
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon'
	import WaveformIcon from 'phosphor-svelte/lib/WaveformIcon'
	import { addLane, automation, checkAreAllCollapsed, checkCanAddLane, redo, toggleAllCollapsed, undo } from '../automation.svelte'
	import { buildGrid, ratioToTime } from '../engine/timeline'
	import { app, formatTime, getAnalysis, seekTo } from '../store.svelte'
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
	import OverviewBar from './OverviewBar.svelte'
	import TimeRuler from './TimeRuler.svelte'
	import TransportBar from './TransportBar.svelte'
	import WaveformTrack from './WaveformTrack.svelte'
	import { checkIsTyping } from './keyboard'
	import './EditorDock.css'

	type PointEditorT = {
		laneId: string
		pointId: string
		anchorX: number
		anchorY: number
	}

	type ResizeDragT = {
		startY: number
		startHeight: number
	}

	const WHEEL_LINE_PX = 16
	const WHEEL_ZOOM_RATE = 0.0025
	const PINCH_ZOOM_RATE = 0.01
	const RESIZE_KEY_PX = 24
	const ZOOMING_ZONES = ['ruler', 'wave', 'overview']

	let dock: HTMLDivElement
	let frame: HTMLDivElement
	let editor = $state<PointEditorT | null>(null)
	let resizeDrag: ResizeDragT | null = null

	const analysis = $derived(getAnalysis())

	const grid = $derived(
		buildGrid({
			view: timeline.view,
			duration: app.duration,
			widthPx: timeline.trackWidth,
			bpm: analysis.bpm,
			beatOffset: analysis.beatOffset
		})
	)

	const laneCount = $derived(automation.lanes.length)
	const hasLanes = $derived(laneCount > 0)
	const canAddLane = $derived(checkCanAddLane())
	const areAllCollapsed = $derived(checkAreAllCollapsed())
	const collapseAllLabel = $derived(areAllCollapsed ? 'Expand all lanes' : 'Collapse all lanes')
	const addLaneLabel = $derived(canAddLane ? 'Add automation lane' : 'Every control already has a lane')
	const laneCountLabel = $derived(String(laneCount))
	const songName = $derived(app.fileName === '' ? 'Untitled' : app.fileName)
	const songMeta = $derived(`${formatTime(app.duration)} · ${Math.round(analysis.bpm)} BPM`)

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

	const handleKeyDown = (event: KeyboardEvent) => {
		if (checkIsTyping(event)) return
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
		if (isCommand || event.altKey) return
		if (key === '=' || key === '+') return zoomIn()
		if (key === '-' || key === '_') return zoomOut()
		if (key === '0') return fitView()
		if (key === 'f') return toggleFollowing()
		if (key === 's') return toggleSnapping()
		if (key === 'home') return seekTo(0)
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

	const handleAddLane = () => {
		const laneId = addLane()
		if (laneId === null) return
		requestAnimationFrame(() => {
			const lanes = frame.querySelector('.editor-lanes')
			lanes?.scrollTo({ top: lanes.scrollHeight, behavior: 'smooth' })
		})
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
						<button class="editor-icon" type="button" aria-label="Add automation lane" disabled={!canAddLane} onclick={handleAddLane}>
							<PlusIcon weight="bold" />
						</button>
					</z-tooltip>
				</div>
			</div>
			<TimeRuler {grid} />
		</div>

		<div class="editor-row isWave">
			<div class="editor-song">
				<span class="editor-song-icon"><WaveformIcon weight="bold" /></span>
				<div class="editor-song-text">
					<span class="editor-song-name" title={songName}>{songName}</span>
					<span class="editor-song-meta">{songMeta}</span>
				</div>
			</div>
			<WaveformTrack />
		</div>

		<div class="editor-lanes">
			{#each automation.lanes as lane (lane.id)}
				<AutomationLane {lane} {grid} onedit={openEditor} />
			{/each}

			<div class="editor-add-row" class:isEmpty={!hasLanes}>
				<div class="editor-add-cell">
					<button class="editor-add-button" type="button" disabled={!canAddLane} onclick={handleAddLane}>
						<PlusIcon weight="bold" />
						Add lane
					</button>
				</div>
				<div class="editor-add-fill">
					{#if !hasLanes}
						<span class="editor-add-hint">Automate any visual control over the song. Each lane starts from the control's current value.</span>
					{/if}
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

	{#if editor !== null}
		<AutomationPopover laneId={editor.laneId} pointId={editor.pointId} anchorX={editor.anchorX} anchorY={editor.anchorY} onclose={closeEditor} />
	{/if}
</div>
