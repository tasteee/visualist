import { recordHistory, recordHistoryCoalesced } from './automation.svelte'
import { LOGO_LAYER_ID, createClip } from './engine/layers'
import type { ClipT, LayerT } from './engine/types'
import { findLayer, getSelectedClips, layerStore, removeClips, removeLayers, selectClips, selectLayers, setLayerTimeRange } from './layers.svelte'
import type { SelectedClipRefT } from './layers.svelte'
import { cloneMappingsForSlicedClip } from './mappings.svelte'
import { app, shareAudioLayerBuffer } from './store.svelte'
import { MIN_CLIP_SECONDS, clamp } from './engine/settings'
import { copyVideo } from './engine/video'

// Copy, paste, duplicate and deactivate for the selected clips or layers,
// the way clips behave in an audio editor.

type ClipboardEntryT = {
	layer: LayerT
	sourceId: string
}

type ClipClipboardEntryT = {
	layerId: string
	clip: ClipT
	length: number
}

export type MultiClipDragItemT = {
	layerId: string
	clipId: string
	isMedia: boolean
	initStart: number
	initEnd: number
	length: number
	hasExplicitEnd: boolean
	minDelta: number
	maxDelta: number
}

export type MultiClipDragSessionT = {
	anchorLayerId: string
	anchorClipId: string
	anchorInitStart: number
	minDelta: number
	maxDelta: number
	items: MultiClipDragItemT[]
}

let clipboard: ClipboardEntryT[] = []
let clipClipboard: ClipClipboardEntryT[] = []

const getSelectedLayers = (): LayerT[] => {
	const selected = layerStore.layers.filter((layer) => layerStore.selectedLayerIds.includes(layer.id))
	return selected.filter((layer) => layer.id !== LOGO_LAYER_ID)
}

const cloneLayer = (layer: LayerT): LayerT => {
	const plain = $state.snapshot(layer) as LayerT
	const fx = plain.fx.map((effect) => ({ ...effect, id: crypto.randomUUID() }))
	const clips = plain.clips.map((clip) => ({ ...clip, id: crypto.randomUUID() }))
	return { ...plain, id: crypto.randomUUID(), fx, clips }
}

// Audio and video are clips: they paste at the playhead and
// duplicate right after the original.
const checkIsClip = (layer: LayerT): boolean => layer.kind === 'audio' || layer.kind === 'video'

// A copied video gets its own decoded file, since a video can be
// at only one time.
const copyVideoFile = (copy: LayerT, sourceAssetId: string | null): void => {
	if (sourceAssetId === null) return
	copy.assetId = copy.id
	void copyVideo(sourceAssetId, copy.id, copy.name).then(() => (layerStore.assetVersion += 1))
}

// Where a clip ends on the timeline. Layers with no file run to the
// end of the song.
export const getClipEnd = (layer: LayerT, clip: ClipT, fileLength: number): number => {
	if (clip.endTime !== null) return clip.endTime
	if (checkIsClip(layer)) return clip.startTime + Math.max(0, fileLength - clip.sourceOffset)
	return app.duration
}

// The stretch of timeline a layer's clips cover together.
const getLayerSpan = (layer: LayerT, fileLength: number): { start: number; end: number } => {
	const starts = layer.clips.map((clip) => clip.startTime)
	const ends = layer.clips.map((clip) => getClipEnd(layer, clip, fileLength))
	return { start: Math.min(...starts), end: Math.max(...ends) }
}

// Moves every clip in the copy by the same amount, keeping their gaps.
const shiftCopy = (copy: LayerT, sourceId: string, delta: number): void => {
	const isClip = checkIsClip(copy)
	if (!isClip) return
	const sourceAssetId = copy.assetId
	for (const clip of copy.clips) {
		clip.startTime = Math.max(0, clip.startTime + delta)
		if (clip.endTime !== null) clip.endTime = Math.max(clip.startTime, clip.endTime + delta)
	}
	if (copy.kind === 'audio') shareAudioLayerBuffer(sourceId, copy.id)
	if (copy.kind === 'video') copyVideoFile(copy, sourceAssetId)
}

export const copySelectedLayers = (getFileLength?: (layerId: string) => number): boolean => {
	const selectedClips = getSelectedClips()
	if (selectedClips.length > 0) {
		clipClipboard = selectedClips.map((target) => {
			const fileLength = getFileLength === undefined ? 0 : getFileLength(target.layer.id)
			const end = getClipEnd(target.layer, target.clip, fileLength)
			return {
				layerId: target.layer.id,
				clip: $state.snapshot(target.clip) as ClipT,
				length: Math.max(MIN_CLIP_SECONDS, end - target.clip.startTime)
			}
		})
		clipboard = []
		return true
	}
	const selected = getSelectedLayers()
	const hasLayers = selected.length > 0
	if (!hasLayers) return false
	clipboard = selected.map((layer) => ({ layer: $state.snapshot(layer) as LayerT, sourceId: layer.id }))
	clipClipboard = []
	return true
}

export const checkCanPaste = (): boolean => clipboard.length > 0 || clipClipboard.length > 0

const addCopies = (copies: LayerT[]): void => {
	recordHistory()
	for (const copy of copies) layerStore.layers.push(copy)
	const ids = copies.map((copy) => copy.id)
	selectLayers(ids, ids[ids.length - 1] ?? null)
}

const insertClipCopyIntoLayer = (layer: LayerT, sourceClip: ClipT, targetStart: number, length: number): ClipT => {
	const start = Math.max(0, targetStart)
	const end = start + Math.max(MIN_CLIP_SECONDS, length)
	const created = createClip({
		...sourceClip,
		id: crypto.randomUUID(),
		kind: layer.kind,
		startTime: start,
		endTime: end,
		textStyle: { ...sourceClip.textStyle },
		transform: { ...sourceClip.transform }
	})
	layer.clips.push(created)
	layer.clips.sort((first, second) => first.startTime - second.startTime)
	cloneMappingsForSlicedClip(layer.id, sourceClip.id, created.id)
	return created
}

// Clips land where the playhead is. Everything else lands as it was.
export const pasteLayers = (playheadTime: number, getFileLength: (layerId: string) => number): boolean => {
	if (clipClipboard.length > 0) {
		const validEntries = clipClipboard.filter((entry) => findLayer(entry.layerId) !== undefined)
		if (validEntries.length === 0) return false
		recordHistory()
		const earliestStart = Math.min(...validEntries.map((entry) => entry.clip.startTime))
		const delta = playheadTime - earliestStart
		const pastedRefs: SelectedClipRefT[] = []
		for (const entry of validEntries) {
			const layer = findLayer(entry.layerId)
			if (layer === undefined) continue
			const created = insertClipCopyIntoLayer(layer, entry.clip, entry.clip.startTime + delta, entry.length)
			pastedRefs.push({ layerId: layer.id, clipId: created.id })
		}
		selectClips(pastedRefs)
		return true
	}
	const hasClipboard = clipboard.length > 0
	if (!hasClipboard) return false
	const copies: LayerT[] = []
	for (const entry of clipboard) {
		const copy = cloneLayer(entry.layer)
		const span = getLayerSpan(entry.layer, getFileLength(entry.sourceId))
		shiftCopy(copy, entry.sourceId, playheadTime - span.start)
		copies.push(copy)
	}
	addCopies(copies)
	return true
}

// Clips repeat right after the selection span. Other layers sit on top of it.
export const duplicateSelectedLayers = (getFileLength: (layerId: string) => number): boolean => {
	const selectedClips = getSelectedClips()
	if (selectedClips.length > 0) {
		recordHistory()
		const starts = selectedClips.map((target) => target.clip.startTime)
		const ends = selectedClips.map((target) => getClipEnd(target.layer, target.clip, getFileLength(target.layer.id)))
		const earliestStart = Math.min(...starts)
		const latestEnd = Math.max(...ends)
		const spanDelta = Math.max(MIN_CLIP_SECONDS, latestEnd - earliestStart)
		const duplicatedRefs: SelectedClipRefT[] = []
		for (const target of selectedClips) {
			const end = getClipEnd(target.layer, target.clip, getFileLength(target.layer.id))
			const length = Math.max(MIN_CLIP_SECONDS, end - target.clip.startTime)
			const plainClip = $state.snapshot(target.clip) as ClipT
			const created = insertClipCopyIntoLayer(target.layer, plainClip, target.clip.startTime + spanDelta, length)
			duplicatedRefs.push({ layerId: target.layer.id, clipId: created.id })
		}
		selectClips(duplicatedRefs)
		return true
	}
	const selected = getSelectedLayers()
	const hasLayers = selected.length > 0
	if (!hasLayers) return false
	const copies = selected.map((layer) => {
		const copy = cloneLayer(layer)
		const isClip = checkIsClip(layer)
		const span = getLayerSpan(layer, getFileLength(layer.id))
		if (isClip) shiftCopy(copy, layer.id, span.end - span.start)
		return copy
	})
	addCopies(copies)
	return true
}

// Cut copies the selected clips or layers, then removes them.
export const cutSelectedLayers = (getFileLength?: (layerId: string) => number): boolean => {
	const hadClips = layerStore.selectedClips.length > 0
	const didCopy = copySelectedLayers(getFileLength)
	if (!didCopy) return false
	if (hadClips) {
		removeClips(layerStore.selectedClips)
		return true
	}
	removeLayers(getSelectedLayers().map((layer) => layer.id))
	return true
}

// The clips the editing keys act on: the selected clips, or
// every clip in the selected layers.
export const getTargetClips = (): { layer: LayerT; clip: ClipT }[] => {
	const pickedClips = getSelectedClips()
	if (pickedClips.length > 0) return pickedClips
	return getSelectedLayers().flatMap((layer) => layer.clips.map((clip) => ({ layer, clip })))
}

// Cuts every targeted clip the playhead crosses in two. The second half
// is a new clip in the same layer that picks up where the first leaves
// off.
export const sliceSelectedLayers = (time: number, getFileLength: (layerId: string) => number): boolean => {
	let didSlice = false
	for (const target of getTargetClips()) {
		const end = getClipEnd(target.layer, target.clip, getFileLength(target.layer.id))
		const isCrossed = time > target.clip.startTime + MIN_CLIP_SECONDS && time < end - MIN_CLIP_SECONDS
		if (!isCrossed) continue
		if (!didSlice) recordHistory()
		didSlice = true
		const isMedia = checkIsClip(target.layer)
		const tail = createClip({
			kind: target.layer.kind,
			startTime: time,
			endTime: target.clip.endTime === null && !isMedia ? null : end,
			sourceOffset: target.clip.sourceOffset + (time - target.clip.startTime),
			isActive: target.clip.isActive,
			name: target.clip.name,
			color: target.clip.color,
			text: target.clip.text,
			textStyle: { ...target.clip.textStyle },
			transform: { ...target.clip.transform }
		})
		target.clip.endTime = time
		target.layer.clips.splice(target.layer.clips.indexOf(target.clip) + 1, 0, tail)
		cloneMappingsForSlicedClip(target.layer.id, target.clip.id, tail.id)
	}
	return didSlice
}

// Deactivating keeps a clip and its settings but stops it playing or
// showing. The layer's own eye is untouched. Pressing again turns the
// clips back on.
export const toggleSelectedLayersActive = (): boolean => {
	const targets = getTargetClips().map((target) => target.clip)
	if (targets.length === 0) return false
	recordHistory()
	const shouldActivate = targets.every((clip) => !clip.isActive)
	for (const clip of targets) clip.isActive = shouldActivate
	return true
}

export const buildMultiClipDragSession = (
	anchorLayerId: string,
	anchorClipId: string,
	getFileLength: (layerId: string) => number
): MultiClipDragSessionT | null => {
	const rawTargets = getTargetClips()
	const hasAnchorInTargets = rawTargets.some((target) => target.layer.id === anchorLayerId && target.clip.id === anchorClipId)
	const anchorLayer = findLayer(anchorLayerId)
	const anchorClip = anchorLayer?.clips.find((candidate) => candidate.id === anchorClipId)
	if (anchorLayer === undefined || anchorClip === undefined) return null
	const targets = hasAnchorInTargets ? rawTargets : [{ layer: anchorLayer, clip: anchorClip }]

	const movingKeys = new Set(targets.map((target) => `${target.layer.id}:${target.clip.id}`))
	const items: MultiClipDragItemT[] = []

	for (const target of targets) {
		const isMedia = checkIsClip(target.layer)
		const fileLength = getFileLength(target.layer.id)
		const initStart = target.clip.startTime
		const initEnd = getClipEnd(target.layer, target.clip, fileLength)
		const length = Math.max(MIN_CLIP_SECONDS, initEnd - initStart)
		const maxTimelineEnd = isMedia ? Number.POSITIVE_INFINITY : app.duration
		let minStart = 0
		let maxEnd = maxTimelineEnd
		for (const candidate of target.layer.clips) {
			const candidateKey = `${target.layer.id}:${candidate.id}`
			if (movingKeys.has(candidateKey)) continue
			const candidateEnd = getClipEnd(target.layer, candidate, fileLength)
			if (candidateEnd <= initStart + 1e-4) minStart = Math.max(minStart, candidateEnd)
			if (candidate.startTime >= initEnd - 1e-4) maxEnd = Math.min(maxEnd, candidate.startTime)
		}
		const minDelta = minStart - initStart
		const maxDelta = Math.max(minDelta, maxEnd - initEnd)
		items.push({
			layerId: target.layer.id,
			clipId: target.clip.id,
			isMedia,
			initStart,
			initEnd,
			length,
			hasExplicitEnd: target.clip.endTime !== null,
			minDelta,
			maxDelta
		})
	}

	const anchorItem = items.find((item) => item.layerId === anchorLayerId && item.clipId === anchorClipId)
	if (anchorItem === undefined) return null
	const minDelta = Math.max(...items.map((item) => item.minDelta))
	const maxDelta = Math.min(...items.map((item) => item.maxDelta))
	return {
		anchorLayerId,
		anchorClipId,
		anchorInitStart: anchorItem.initStart,
		minDelta,
		maxDelta: Math.max(minDelta, maxDelta),
		items
	}
}

export const applyMultiClipDragDelta = (session: MultiClipDragSessionT, rawDelta: number): void => {
	const delta = clamp(rawDelta, session.minDelta, session.maxDelta)
	const orderedItems = delta >= 0 ? [...session.items].sort((first, second) => second.initStart - first.initStart) : [...session.items].sort((first, second) => first.initStart - second.initStart)
	for (const item of orderedItems) {
		const layer = findLayer(item.layerId)
		const clip = layer?.clips.find((candidate) => candidate.id === item.clipId)
		if (layer === undefined || clip === undefined) continue
		const nextStart = Math.max(0, item.initStart + delta)
		const nextEnd = nextStart + item.length
		if (item.isMedia) {
			clip.startTime = nextStart
			const hasFiniteMax = item.maxDelta < Number.POSITIVE_INFINITY
			if (item.hasExplicitEnd || hasFiniteMax) clip.endTime = nextEnd
			continue
		}
		setLayerTimeRange(layer.id, clip.id, nextStart, nextEnd, app.duration)
	}
}

export type ClipNudgeT = {
	// Positive moves later, negative earlier.
	direction: number
	// The grid step. With a grid offset, clips land on the next line.
	step: number
	gridOffset: number | null
}

const getNudgeDelta = (anchorStart: number, nudge: ClipNudgeT): number => {
	const hasGrid = nudge.gridOffset !== null
	if (!hasGrid) return nudge.direction * nudge.step
	const offset = nudge.gridOffset ?? 0
	const epsilon = 1e-6
	const stepsFromOffset = (anchorStart - offset) / nudge.step
	const nextStep = nudge.direction > 0 ? Math.floor(stepsFromOffset + epsilon) + 1 : Math.ceil(stepsFromOffset - epsilon) - 1
	return offset + nextStep * nudge.step - anchorStart
}

// Moves the targeted clips along the timeline, all by the same
// amount. The first one lands on the next grid line.
export const nudgeSelectedLayerTimes = (nudge: ClipNudgeT, getFileLength: (layerId: string) => number): boolean => {
	const targets = getTargetClips()
	const hasTargets = targets.length > 0
	if (!hasTargets) return false
	const earliestTarget = targets.reduce((best, current) => (current.clip.startTime < best.clip.startTime ? current : best), targets[0])
	const session = buildMultiClipDragSession(earliestTarget.layer.id, earliestTarget.clip.id, getFileLength)
	if (session === null) return false
	const rawDelta = getNudgeDelta(earliestTarget.clip.startTime, nudge)
	const clampedDelta = clamp(rawDelta, session.minDelta, session.maxDelta)
	if (Math.abs(clampedDelta) < 1e-6) return true
	recordHistoryCoalesced('nudge-clip-times')
	applyMultiClipDragDelta(session, clampedDelta)
	return true
}
