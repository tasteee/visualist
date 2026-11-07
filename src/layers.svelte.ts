import { toaster } from '@tasteee/zest'
import { recordHistory, removeLanesForFx, removeLanesForLayer } from './automation.svelte'
import { importAssetFile, restoreAssets } from './engine/assets'
import type { AssetRequestT } from './engine/assets'
import { LOGO_LAYER_ID, createAssetLayer, createDefaultLayers, createFx, createLogoLayer, createShapeLayer, createTextLayer } from './engine/layers'
import type { FxKindT, LayerFxT, LayerT, ShapeT, TextContentT } from './engine/types'

type LayerStoreT = {
	layers: LayerT[]
	// The layer open in the panel and the stage, and every layer
	// in the current selection. The first is always one of them.
	selectedLayerId: string | null
	selectedLayerIds: string[]
	// Bumps when a decoded file arrives, so the frame redraws.
	assetVersion: number
	isImporting: boolean
}

export type LayerDirectionT = 'forward' | 'backward'

const STORAGE_KEY = 'vink.layers.v1'
const NAME_LIMIT = 40

const getFileBaseName = (fileName: string): string => {
	const withoutExtension = fileName.replace(/\.[^.]+$/, '')
	return withoutExtension.slice(0, NAME_LIMIT)
}

// Layers saved before colors lived in the palette named a slot.
const LEGACY_COLOR_IDS: Record<string, string> = {
	foreground: 'white',
	background: 'black',
	accent1: 'accent-1',
	accent2: 'accent-2'
}

const migrateColorId = (value: unknown, fallback: string): string => {
	if (typeof value !== 'string') return fallback
	return LEGACY_COLOR_IDS[value] ?? value
}

// Stored layers come back merged over fresh defaults, so older
// saves gain any field added since.
const normalizeLayer = (stored: Partial<LayerT>): LayerT | null => {
	const kind = stored.kind
	const isKnownKind = kind === 'logo' || kind === 'text' || kind === 'image' || kind === 'svg' || kind === 'audio' || kind === 'shape'
	if (!isKnownKind) return null
	const base = kind === 'logo' ? createLogoLayer() : createTextLayer('')
	const legacyVolume = (stored as { volume?: unknown }).volume
	const volumeFallback = typeof legacyVolume === 'number' ? { volume: legacyVolume } : {}
	const transform = { ...base.transform, ...volumeFallback, ...stored.transform }
	const modulations = { ...stored.modulations }
	const fx = Array.isArray(stored.fx) ? stored.fx : []
	const mergedText = { ...base.text, ...stored.text } as TextContentT
	const text = kind === 'text' ? { ...mergedText, color: migrateColorId(mergedText.color, 'white') } : null
	const shapeBase = createShapeLayer().shape as ShapeT
	const mergedShape = { ...shapeBase, ...stored.shape } as ShapeT
	const shape = kind === 'shape' ? { ...mergedShape, color: migrateColorId(mergedShape.color, 'white'), color2: migrateColorId(mergedShape.color2, 'accent-1') } : null
	const svgColor = migrateColorId(stored.svgColor, 'original')
	const normalized = { ...base, ...stored, kind, transform, modulations, fx, text, shape, svgColor } as LayerT
	return normalized
}

const loadLayers = (): LayerT[] => {
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY)
		if (stored === null) return createDefaultLayers()
		const parsed = JSON.parse(stored) as Partial<LayerT>[]
		const isList = Array.isArray(parsed)
		if (!isList) return createDefaultLayers()
		const normalized = parsed.map(normalizeLayer)
		const layers = normalized.filter((layer): layer is LayerT => layer !== null)
		return layers
	} catch {
		return createDefaultLayers()
	}
}

// If storage is blocked the layers still work, they just reset.
const saveLayers = (layers: LayerT[]): void => {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layers))
	} catch {
		return
	}
}

export const layerStore = $state<LayerStoreT>({
	layers: loadLayers(),
	selectedLayerId: null,
	selectedLayerIds: [],
	assetVersion: 0,
	isImporting: false
})

export const findLayer = (layerId: string | null): LayerT | undefined => {
	if (layerId === null) return undefined
	return layerStore.layers.find((layer) => layer.id === layerId)
}

export const getSelectedLayer = (): LayerT | undefined => findLayer(layerStore.selectedLayerId)

export const selectLayers = (layerIds: string[], primaryId: string | null): void => {
	layerStore.selectedLayerIds = layerIds
	layerStore.selectedLayerId = primaryId
}

export const selectLayer = (layerId: string | null): void => {
	const ids = layerId === null ? [] : [layerId]
	selectLayers(ids, layerId)
}

export const checkIsLayerSelected = (layerId: string): boolean => layerStore.selectedLayerIds.includes(layerId)

export const focusLayer = (layerId: string): void => {
	selectLayer(layerId)
}

// A name commits once, as the whole name. The editing field
// keeps its own text undo until then.
export const renameLayer = (layerId: string, name: string): void => {
	const layer = findLayer(layerId)
	if (layer === undefined) return
	const trimmed = name.slice(0, NAME_LIMIT)
	const isBlank = trimmed.trim().length === 0
	const isChange = trimmed !== layer.name
	if (isBlank || !isChange) return
	recordHistory()
	layer.name = trimmed
}

const MIN_CLIP_SECONDS = 0.1

export type LayerTimeRangeT = {
	startTime: number
	endTime: number | null
}

// endTime at or past the song's end means "to the end", so the
// layer keeps going if a longer song is loaded later.
export const setLayerTimeRange = (layerId: string, startTime: number, endTime: number, songLength: number): void => {
	const layer = findLayer(layerId)
	if (layer === undefined) return
	const safeStart = Math.max(0, Math.min(startTime, songLength - MIN_CLIP_SECONDS))
	const safeEnd = Math.max(safeStart + MIN_CLIP_SECONDS, endTime)
	const isAtSongEnd = safeEnd >= songLength - 0.005
	layer.startTime = safeStart
	layer.endTime = isAtSongEnd ? null : safeEnd
}

// New layers land on top of the stack, in front of everything.
const pushLayer = (layer: LayerT): void => {
	recordHistory()
	layerStore.layers.push(layer)
	selectLayer(layer.id)
}

// The track title already has its own spot in the logo
// scene, so new text starts as a placeholder.
export const addTextLayer = (): void => {
	pushLayer(createTextLayer('Your text'))
}

export const addShapeLayer = (): void => {
	pushLayer(createShapeLayer())
}

// An image layer starts empty. The picture is chosen in the
// layer's settings.
export const addImageLayer = (): void => {
	pushLayer(createAssetLayer('image', null, 'Image'))
}

// Puts a picture into an image layer, and the layer on top of
// every other layer.
export const setLayerImageFile = async (layerId: string, file: File): Promise<void> => {
	layerStore.isImporting = true
	try {
		const asset = await importAssetFile(file)
		const layer = findLayer(layerId)
		if (layer === undefined) return
		recordHistory()
		layer.assetId = asset.id
		layer.kind = asset.kind === 'svg' ? 'svg' : 'image'
		layerStore.assetVersion += 1
		const others = layerStore.layers.filter((candidate) => candidate.id !== layerId)
		layerStore.layers = [...others, layer]
	} catch {
		const message = 'That file could not be read. Try a PNG, JPG, WebP, GIF or SVG.'
		toaster.show({ title: 'Could not add the picture', description: message, tone: 'danger' })
	} finally {
		layerStore.isImporting = false
	}
}

export const addAssetLayer = async (file: File): Promise<void> => {
	layerStore.isImporting = true
	try {
		const asset = await importAssetFile(file)
		pushLayer(createAssetLayer(asset.kind, asset.id, getFileBaseName(file.name)))
		layerStore.assetVersion += 1
	} catch {
		const message = 'That file could not be read. Try a PNG, JPG, WebP, GIF or SVG.'
		toaster.show({ title: 'Could not add the layer', description: message, tone: 'danger' })
	} finally {
		layerStore.isImporting = false
	}
}

// Removing layers is one undo step. Their files stay stored,
// so undo can bring the layers back.
export const removeLayers = (layerIds: string[]): void => {
	const removableIds = layerIds.filter((layerId) => {
		const layer = findLayer(layerId)
		return layer !== undefined
	})
	const hasLayers = removableIds.length > 0
	if (!hasLayers) return
	recordHistory()
	const doomedIds = new Set(removableIds)
	layerStore.layers = layerStore.layers.filter((candidate) => !doomedIds.has(candidate.id))
	const remainingIds = layerStore.selectedLayerIds.filter((candidate) => !doomedIds.has(candidate))
	const primaryId = remainingIds[remainingIds.length - 1] ?? null
	selectLayers(remainingIds, primaryId)
	for (const layerId of removableIds) removeLanesForLayer(layerId)
}

export const removeLayer = (layerId: string): void => removeLayers([layerId])

// forward moves toward the front, which is later in the list.
export const moveLayer = (layerId: string, direction: LayerDirectionT): void => {
	const index = layerStore.layers.findIndex((layer) => layer.id === layerId)
	if (index === -1) return
	const step = direction === 'forward' ? 1 : -1
	const targetIndex = index + step
	const isOutOfBounds = targetIndex < 0 || targetIndex >= layerStore.layers.length
	if (isOutOfBounds) return
	recordHistory()
	const reordered = [...layerStore.layers]
	const moving = reordered[index]
	reordered[index] = reordered[targetIndex]
	reordered[targetIndex] = moving
	layerStore.layers = reordered
}

// Places a layer at a position in the front-to-back order the
// timeline and the panel show, where 0 is the front.
export const moveLayerToFrontIndex = (layerId: string, frontIndex: number): void => {
	const frontToBack = [...layerStore.layers].reverse()
	const currentIndex = frontToBack.findIndex((layer) => layer.id === layerId)
	if (currentIndex === -1) return
	const moving = frontToBack[currentIndex]
	const others = frontToBack.filter((layer) => layer.id !== layerId)
	const targetIndex = Math.max(0, Math.min(frontIndex, others.length))
	const isSamePlace = targetIndex === currentIndex
	if (isSamePlace) return
	recordHistory()
	const reordered = [...others.slice(0, targetIndex), moving, ...others.slice(targetIndex)]
	layerStore.layers = reordered.reverse()
}

export const checkCanMove = (layerId: string, direction: LayerDirectionT): boolean => {
	const index = layerStore.layers.findIndex((layer) => layer.id === layerId)
	if (index === -1) return false
	const isFront = index === layerStore.layers.length - 1
	const isBack = index === 0
	if (direction === 'forward') return !isFront
	return !isBack
}

export const toggleLayerVisible = (layerId: string): void => {
	const layer = findLayer(layerId)
	if (layer === undefined) return
	recordHistory()
	layer.isVisible = !layer.isVisible
}

export const addLayerFx = (layerId: string, kind: FxKindT): void => {
	const layer = findLayer(layerId)
	if (layer === undefined) return
	recordHistory()
	layer.fx.push(createFx(kind))
}

export const removeLayerFx = (layerId: string, fxId: string): void => {
	const layer = findLayer(layerId)
	if (layer === undefined) return
	recordHistory()
	layer.fx = layer.fx.filter((fx: LayerFxT) => fx.id !== fxId)
	removeLanesForFx(fxId)
}

const collectAssetRequests = (): AssetRequestT[] => {
	const requests: AssetRequestT[] = []
	for (const layer of layerStore.layers) {
		const assetId = layer.assetId
		const isAssetLayer = layer.kind === 'image' || layer.kind === 'svg'
		if (!isAssetLayer || assetId === null) continue
		requests.push({ assetId, kind: layer.kind === 'svg' ? 'svg' : 'image' })
	}
	return requests
}

// Layers whose file is gone stay in the list, so their settings
// are not lost, but they draw nothing until replaced.
export const restoreLayerAssets = async (): Promise<void> => {
	const requests = collectAssetRequests()
	const hasRequests = requests.length > 0
	if (!hasRequests) return
	const missingIds = await restoreAssets(requests)
	layerStore.assetVersion += 1
	const hasMissing = missingIds.length > 0
	if (!hasMissing) return
	const description = `${missingIds.length} layer file(s) could not be restored. Those layers are empty.`
	toaster.show({ title: 'Some layer files are missing', description, tone: 'warning' })
}

export const startLayerWatchers = (): void => {
	$effect.root(() => {
		$effect(() => {
			saveLayers($state.snapshot(layerStore.layers) as LayerT[])
		})
	})
}
