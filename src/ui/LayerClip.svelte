<script lang="ts">
	import { recordHistory } from '../automation.svelte'
	import { MIN_CLIP_SECONDS, clamp } from '../engine/settings'
	import { getClipNeighborBounds } from '../engine/layers'
	import { getVideoDuration } from '../engine/video'
	import { formatPreciseTime, ratioToTime, snapToGrid, timeToPercent } from '../engine/timeline'
	import type { TimelineGridT } from '../engine/timeline'
	import type { ClipT, LayerT } from '../engine/types'
	import { applyMultiClipDragDelta, buildMultiClipDragSession } from '../layerEdit.svelte'
	import type { MultiClipDragSessionT } from '../layerEdit.svelte'
	import { layerStore, setLayerTimeRange } from '../layers.svelte'
	import { pickClip, readModifiers } from '../selection.svelte'
	import { app, getAudioLayerBuffer } from '../store.svelte'
	import { timeline } from '../timeline.svelte'
	import './LayerClip.css'

	type LayerClipPropsT = {
		layer: LayerT
		clip: ClipT
		grid: TimelineGridT
		isSelected: boolean
	}

	type DragModeT = 'move' | 'start' | 'end'

	type ClipDragT = {
		mode: DragModeT
		grabOffset: number
		length: number
		hasMoved: boolean
		startX: number
		shouldSelectSingleOnUp: boolean
		session: MultiClipDragSessionT | null
	}

	const props: LayerClipPropsT = $props()

	const MOVE_THRESHOLD_PX = 3

	let root: HTMLDivElement
	let drag = $state<ClipDragT | null>(null)

	const isVideoLayer = (): boolean => props.layer.kind === 'video'

	const view = $derived(timeline.view)
	const duration = $derived(app.duration)
	const startTime = $derived(isVideoLayer() ? props.clip.startTime : Math.min(props.clip.startTime, duration))
	const isVideo = $derived(props.layer.kind === 'video')
	// A text clip is named by its words.
	const clipLabel = $derived(props.clip.name || (props.layer.kind === 'text' && props.clip.text.trim().length > 0 ? props.clip.text.replace(/\s+/g, ' ').trim() : props.layer.name))
	const sourceOffset = $derived(props.clip.sourceOffset)
	// A video plays its file once. Where it ends if it is never cut short.
	const naturalEnd = $derived(startTime + Math.max(0, getVideoDuration(props.layer.assetId) - sourceOffset))
	const endTime = $derived(props.clip.endTime ?? (isVideo ? naturalEnd : duration))
	const leftPercent = $derived(clamp(timeToPercent(startTime, view), -1, 101))
	const rightPercent = $derived(clamp(100 - timeToPercent(endTime, view), -1, 101))
	const isDragging = $derived(drag !== null)
	const isFullSong = $derived(startTime <= 0 && props.clip.endTime === null)
	const rangeLabel = $derived(`${formatPreciseTime(startTime)} – ${formatPreciseTime(endTime)}`)
	const ariaLabel = $derived(`${props.layer.name} shows from ${rangeLabel}. Drag to move, drag an edge to trim.`)

	const getFileLength = (layerId: string): number => {
		const audioLength = getAudioLayerBuffer(layerId)?.duration
		if (audioLength !== undefined) return audioLength
		const candidate = layerStore.layers.find((entry) => entry.id === layerId)
		return getVideoDuration(candidate?.assetId ?? null)
	}

	const readTime = (event: PointerEvent): number => {
		const track = root.closest<HTMLElement>('[data-track]')
		if (track === null) return 0
		const bounds = track.getBoundingClientRect()
		const ratio = (event.clientX - bounds.left) / bounds.width
		return clamp(ratioToTime(ratio, view), 0, duration)
	}

	// Shift frees the clip from the beat grid, like points.
	const snapTime = (time: number, event: PointerEvent, latest: number): number => {
		const shouldSnap = timeline.isSnapping && !event.shiftKey
		if (!shouldSnap) return time
		return clamp(snapToGrid(time, props.grid), 0, latest)
	}

	const readMode = (event: PointerEvent): DragModeT => {
		const target = event.target as HTMLElement
		const edge = target.dataset.edge
		if (edge === 'start') return 'start'
		if (edge === 'end') return 'end'
		return 'move'
	}

	const handleDown = (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		event.stopPropagation()
		root.setPointerCapture(event.pointerId)
		const pointerTime = readTime(event)
		const mode = readMode(event)
		const modifiers = readModifiers(event)
		const isAdditive = modifiers.isToggle || modifiers.isRange
		const isPartOfMultiSelect = props.isSelected && layerStore.selectedClips.length > 1 && !isAdditive && mode === 'move'
		if (!isPartOfMultiSelect) pickClip(props.layer.id, props.clip.id, modifiers)
		const session = mode === 'move' ? buildMultiClipDragSession(props.layer.id, props.clip.id, getFileLength) : null
		drag = {
			mode,
			grabOffset: pointerTime - startTime,
			length: endTime - startTime,
			hasMoved: false,
			startX: event.clientX,
			shouldSelectSingleOnUp: isPartOfMultiSelect,
			session
		}
	}

	const getClipEndForBounds = (candidate: ClipT): number => {
		if (candidate.endTime !== null) return candidate.endTime
		if (isVideo) return candidate.startTime + Math.max(0, getVideoDuration(props.layer.assetId) - candidate.sourceOffset)
		return duration
	}

	const getBounds = () => {
		const maxTimelineEnd = isVideo ? Number.POSITIVE_INFINITY : duration
		return getClipNeighborBounds(props.layer.clips, props.clip.id, getClipEndForBounds, maxTimelineEnd)
	}

	// Trimming a video's start moves where in the file it begins, so
	// the picture stays where it was on the timeline.
	const trimVideoStart = (event: PointerEvent) => {
		const bounds = getBounds()
		const earliest = Math.max(bounds.minStart, startTime - sourceOffset)
		const latest = endTime - MIN_CLIP_SECONDS
		const nextStart = clamp(snapTime(readTime(event), event, latest), earliest, latest)
		props.clip.sourceOffset = Math.max(0, sourceOffset + nextStart - startTime)
		props.clip.startTime = nextStart
	}

	const trimVideoEnd = (event: PointerEvent) => {
		const bounds = getBounds()
		const maxEnd = Math.min(naturalEnd, bounds.maxEnd)
		const nextEnd = clamp(snapTime(readTime(event), event, maxEnd), startTime + MIN_CLIP_SECONDS, maxEnd)
		props.clip.endTime = nextEnd
	}

	const moveClipGroup = (event: PointerEvent, activeDrag: ClipDragT) => {
		const session = activeDrag.session
		if (session === null) return
		const pointerTime = readTime(event)
		const minAnchorStart = Math.max(0, session.anchorInitStart + session.minDelta)
		const maxAnchorStart = Math.max(minAnchorStart, session.anchorInitStart + session.maxDelta)
		const rawAnchorStart = clamp(pointerTime - activeDrag.grabOffset, minAnchorStart, maxAnchorStart)
		const snappedAnchorStart = clamp(snapTime(rawAnchorStart, event, maxAnchorStart), minAnchorStart, maxAnchorStart)
		applyMultiClipDragDelta(session, snappedAnchorStart - session.anchorInitStart)
	}

	const handleMove = (event: PointerEvent) => {
		const activeDrag = drag
		if (activeDrag === null) return
		const travel = Math.abs(event.clientX - activeDrag.startX)
		const hasStartedMoving = activeDrag.hasMoved || travel >= MOVE_THRESHOLD_PX
		if (!hasStartedMoving) return
		// One drag is one undo step, recorded when it really
		// starts, so a plain click to select adds nothing.
		const isFirstMove = !activeDrag.hasMoved
		if (isFirstMove) recordHistory()
		activeDrag.hasMoved = true
		if (activeDrag.mode === 'move') return moveClipGroup(event, activeDrag)
		if (isVideo) {
			if (activeDrag.mode === 'start') return trimVideoStart(event)
			return trimVideoEnd(event)
		}
		const edgeTime = snapTime(readTime(event), event, duration)
		const isStartEdge = activeDrag.mode === 'start'
		if (isStartEdge) {
			const previousStart = props.clip.startTime
			setLayerTimeRange(props.layer.id, props.clip.id, edgeTime, endTime, duration)
			props.clip.sourceOffset = Math.max(0, props.clip.sourceOffset + (props.clip.startTime - previousStart))
			return
		}
		setLayerTimeRange(props.layer.id, props.clip.id, startTime, edgeTime, duration)
	}

	const handleUp = () => {
		const activeDrag = drag
		drag = null
		if (activeDrag !== null && !activeDrag.hasMoved && activeDrag.shouldSelectSingleOnUp) {
			pickClip(props.layer.id, props.clip.id)
		}
	}

	// Double-click fills the available span between neighbors.
	const handleDoubleClick = (event: MouseEvent) => {
		event.stopPropagation()
		if (isVideo) return
		if (isFullSong) return
		recordHistory()
		const bounds = getBounds()
		setLayerTimeRange(props.layer.id, props.clip.id, bounds.minStart, Math.min(duration, bounds.maxEnd), duration)
	}
</script>

<div
	class="layer-clip"
	class:isSelected={props.isSelected}
	class:isDragging
	class:isHidden={!props.layer.isVisible || !props.clip.isActive}
	class:isFullSong
	data-tone={props.clip.color ?? undefined}
	data-layer-id={props.layer.id}
	data-clip-id={props.clip.id}
	bind:this={root}
	style:--clip-left="{leftPercent}%"
	style:--clip-right="{rightPercent}%"
	role="group"
	aria-label={props.layer.name}
	onpointermove={handleMove}
	onpointerup={handleUp}
	onpointercancel={handleUp}
>
	<div
		class="layer-clip-bar"
		data-clip-control
		role="slider"
		tabindex="0"
		title="{props.layer.name} · {rangeLabel} · drag to move"
		aria-label={ariaLabel}
		aria-valuemin={0}
		aria-valuemax={duration}
		aria-valuenow={startTime}
		onpointerdown={handleDown}
		ondblclick={handleDoubleClick}
	>
		<span class="layer-clip-label">
			<span class="layer-clip-name">{clipLabel}</span>
			{#if isDragging}
				<span class="layer-clip-range">{rangeLabel}</span>
			{/if}
		</span>
	</div>
	<span class="layer-clip-edge isStart" data-clip-control data-edge="start" role="presentation" onpointerdown={handleDown}></span>
	<span class="layer-clip-edge isEnd" data-clip-control data-edge="end" role="presentation" onpointerdown={handleDown}></span>
</div>
