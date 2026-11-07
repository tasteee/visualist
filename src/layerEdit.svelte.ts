import { recordHistory, recordHistoryCoalesced } from './automation.svelte'
import { LOGO_LAYER_ID } from './engine/layers'
import type { LayerT } from './engine/types'
import { layerStore, selectLayers, setLayerTimeRange } from './layers.svelte'
import { app, getAudioLayerBuffer, shareAudioLayerBuffer } from './store.svelte'
import { copyVideo, getVideoDuration } from './engine/video'
import { MIN_CLIP_SECONDS } from './engine/settings'
import { removeLayers } from './layers.svelte'

// Copy, paste, duplicate and deactivate for the selected layers,
// the way clips behave in an audio editor.

// What copy holds: plain copies of the layers, and the ids they
// came from, so pasted audio can share its original's sound.
type ClipboardEntryT = {
	layer: LayerT
	sourceId: string
}

let clipboard: ClipboardEntryT[] = []

const getSelectedLayers = (): LayerT[] => {
	const selected = layerStore.layers.filter((layer) => layerStore.selectedLayerIds.includes(layer.id))
	return selected.filter((layer) => layer.id !== LOGO_LAYER_ID)
}

const cloneLayer = (layer: LayerT): LayerT => {
	const plain = $state.snapshot(layer) as LayerT
	const fx = plain.fx.map((effect) => ({ ...effect, id: crypto.randomUUID() }))
	return { ...plain, id: crypto.randomUUID(), fx }
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

// How long an audio or video file is. Other layers have no file.
const getFileLength = (layer: LayerT): number => {
	if (layer.kind === 'audio') return getAudioLayerBuffer(layer.id)?.duration ?? 0
	if (layer.kind === 'video') return getVideoDuration(layer.assetId)
	return 0
}

// Where a layer ends on the timeline.
const getClipEnd = (layer: LayerT): number => {
	if (layer.endTime !== null) return layer.endTime
	if (checkIsClip(layer)) return layer.startTime + Math.max(0, getFileLength(layer) - layer.sourceOffset)
	return app.duration
}

const placeCopy = (copy: LayerT, sourceId: string, startTime: number): void => {
	const isClip = checkIsClip(copy)
	if (!isClip) return
	const length = copy.endTime === null ? null : copy.endTime - copy.startTime
	const sourceAssetId = copy.assetId
	copy.startTime = Math.max(0, startTime)
	copy.endTime = length === null ? null : copy.startTime + length
	if (copy.kind === 'audio') shareAudioLayerBuffer(sourceId, copy.id)
	if (copy.kind === 'video') copyVideoFile(copy, sourceAssetId)
}

export const copySelectedLayers = (): boolean => {
	const selected = getSelectedLayers()
	const hasLayers = selected.length > 0
	if (!hasLayers) return false
	clipboard = selected.map((layer) => ({ layer: $state.snapshot(layer) as LayerT, sourceId: layer.id }))
	return true
}

export const checkCanPaste = (): boolean => clipboard.length > 0

const addCopies = (copies: LayerT[]): void => {
	recordHistory()
	for (const copy of copies) layerStore.layers.push(copy)
	const ids = copies.map((copy) => copy.id)
	selectLayers(ids, ids[ids.length - 1] ?? null)
}

// Clips land where the playhead is. Everything else lands as it was.
export const pasteLayers = (playheadTime: number): boolean => {
	const hasClipboard = clipboard.length > 0
	if (!hasClipboard) return false
	const copies: LayerT[] = []
	for (const entry of clipboard) {
		const copy = cloneLayer(entry.layer)
		placeCopy(copy, entry.sourceId, playheadTime)
		copies.push(copy)
	}
	addCopies(copies)
	return true
}

// Clips repeat right after the original. Other layers sit on top of it.
export const duplicateSelectedLayers = (): boolean => {
	const selected = getSelectedLayers()
	const hasLayers = selected.length > 0
	if (!hasLayers) return false
	const copies = selected.map((layer) => {
		const copy = cloneLayer(layer)
		const isClip = checkIsClip(layer)
		if (isClip) placeCopy(copy, layer.id, getClipEnd(layer))
		return copy
	})
	addCopies(copies)
	return true
}

// Deactivating keeps a layer and its settings but stops it playing or
// showing. Pressing again turns it back on.
export const toggleSelectedLayersActive = (): boolean => {
	const selected = layerStore.layers.filter((layer) => layerStore.selectedLayerIds.includes(layer.id))
	const hasLayers = selected.length > 0
	if (!hasLayers) return false
	recordHistory()
	const shouldActivate = selected.every((layer) => !layer.isVisible)
	for (const layer of selected) layer.isVisible = shouldActivate
	return true
}

// Cut copies the selected layers, then removes them.
export const cutSelectedLayers = (): boolean => {
	const didCopy = copySelectedLayers()
	if (!didCopy) return false
	removeLayers(getSelectedLayers().map((layer) => layer.id))
	return true
}

// Slicing cuts every selected layer under the playhead into two. For
// audio and video the second piece plays on from the cut, so each
// piece keeps its own part of the file. Text, images and shapes just
// show for a shorter span each.
export const sliceSelectedLayers = (time: number): boolean => {
	const selected = getSelectedLayers()
	const sliceable = selected.filter((layer) => checkCanSlice(layer, time))
	const hasLayers = sliceable.length > 0
	if (!hasLayers) return false
	recordHistory()
	const rights: LayerT[] = []
	for (const layer of sliceable) rights.push(sliceLayer(layer, time))
	const ids = rights.map((right) => right.id)
	selectLayers(ids, ids[ids.length - 1] ?? null)
	return true
}

const checkCanSlice = (layer: LayerT, time: number): boolean => {
	const margin = 0.01
	const isAfterStart = time > layer.startTime + margin
	const isBeforeEnd = time < getClipEnd(layer) - margin
	return isAfterStart && isBeforeEnd
}

const sliceLayer = (layer: LayerT, time: number): LayerT => {
	const right = cloneLayer(layer)
	const originalEnd = layer.endTime
	const sourceId = layer.id
	const sourceAssetId = layer.assetId
	right.startTime = time
	right.endTime = originalEnd
	right.sourceOffset = layer.sourceOffset + (checkIsClip(layer) ? time - layer.startTime : 0)
	layer.endTime = time
	if (layer.kind === 'audio') shareAudioLayerBuffer(sourceId, right.id)
	if (layer.kind === 'video') copyVideoFile(right, sourceAssetId)
	const index = layerStore.layers.findIndex((candidate) => candidate.id === layer.id)
	layerStore.layers.splice(index + 1, 0, right)
	return right
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

// Moves the selected layers along the timeline, all by the same
// amount. The first one lands on the next grid line. True when a
// layer took the key.
export const nudgeSelectedLayerTimes = (nudge: ClipNudgeT): boolean => {
	const selected = getSelectedLayers()
	const hasLayers = selected.length > 0
	if (!hasLayers) return false
	const earliest = Math.min(...selected.map((layer) => layer.startTime))
	const rawDelta = getNudgeDelta(earliest, nudge)
	const delta = Math.max(rawDelta, -earliest)
	if (delta === 0) return true
	recordHistoryCoalesced('nudge-clip-times')
	for (const layer of selected) moveLayerInTime(layer, delta)
	return true
}

const moveLayerInTime = (layer: LayerT, delta: number): void => {
	const start = layer.startTime + delta
	const isMedia = checkIsClip(layer)
	if (isMedia) {
		layer.startTime = start
		layer.endTime = layer.endTime === null ? null : layer.endTime + delta
		return
	}
	const length = getClipEnd(layer) - layer.startTime
	setLayerTimeRange(layer.id, start, start + Math.max(length, MIN_CLIP_SECONDS), app.duration)
}
