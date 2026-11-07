import { recordHistory } from './automation.svelte'
import { LOGO_LAYER_ID } from './engine/layers'
import type { LayerT } from './engine/types'
import { layerStore, selectLayers } from './layers.svelte'
import { shareAudioLayerBuffer } from './store.svelte'
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

// Where a clip ends on the timeline.
const getClipEnd = (layer: LayerT, fileLength: number): number => {
	if (layer.endTime !== null) return layer.endTime
	return layer.startTime + Math.max(0, fileLength - layer.sourceOffset)
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
export const duplicateSelectedLayers = (getFileLength: (layerId: string) => number): boolean => {
	const selected = getSelectedLayers()
	const hasLayers = selected.length > 0
	if (!hasLayers) return false
	const copies = selected.map((layer) => {
		const copy = cloneLayer(layer)
		const isClip = checkIsClip(layer)
		if (isClip) placeCopy(copy, layer.id, getClipEnd(layer, getFileLength(layer.id)))
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
