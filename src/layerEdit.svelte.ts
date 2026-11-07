import { recordHistory } from './automation.svelte'
import { LOGO_LAYER_ID, createClip } from './engine/layers'
import type { ClipT, LayerT } from './engine/types'
import { getSelectedClip, layerStore, selectLayers } from './layers.svelte'
import { app, shareAudioLayerBuffer } from './store.svelte'
import { MIN_CLIP_SECONDS } from './engine/settings'
import { copyVideo } from './engine/video'

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
const getClipEnd = (layer: LayerT, clip: ClipT, fileLength: number): number => {
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
export const pasteLayers = (playheadTime: number, getFileLength: (layerId: string) => number): boolean => {
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

// Clips repeat right after the original. Other layers sit on top of it.
export const duplicateSelectedLayers = (getFileLength: (layerId: string) => number): boolean => {
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

// The clips the editing keys act on: the one picked on its own, or
// every clip in the selected layers.
const getTargetClips = (): { layer: LayerT; clip: ClipT }[] => {
	const picked = getSelectedClip()
	if (picked !== undefined) return [picked]
	return getSelectedLayers().flatMap((layer) => layer.clips.map((clip) => ({ layer, clip })))
}

// Cuts every targeted clip the playhead crosses in two. The second half
// is a new clip in the same layer that picks up where the first leaves
// off.
export const sliceSelectedLayers = (time: number, getFileLength: (layerId: string) => number): boolean => {
	let didSlice = false
	for (const { layer, clip } of getTargetClips()) {
		const end = getClipEnd(layer, clip, getFileLength(layer.id))
		const isCrossed = time > clip.startTime + MIN_CLIP_SECONDS && time < end - MIN_CLIP_SECONDS
		if (!isCrossed) continue
		if (!didSlice) recordHistory()
		didSlice = true
		const isMedia = checkIsClip(layer)
		const tail = createClip({
			startTime: time,
			endTime: clip.endTime === null && !isMedia ? null : end,
			sourceOffset: isMedia ? clip.sourceOffset + (time - clip.startTime) : 0,
			isActive: clip.isActive,
			name: clip.name,
			color: clip.color,
			text: clip.text,
			textStyle: { ...clip.textStyle },
			transform: { ...clip.transform }
		})
		clip.endTime = time
		layer.clips.splice(layer.clips.indexOf(clip) + 1, 0, tail)
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
