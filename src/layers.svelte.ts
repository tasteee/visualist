import { toaster } from '@tasteee/zest'
import { deleteAsset, importAssetFile, restoreAssets } from './engine/assets'
import type { AssetRequestT } from './engine/assets'
import { LOGO_LAYER_ID, createAssetLayer, createDefaultLayers, createFx, createLogoLayer, createTextLayer } from './engine/layers'
import type { FxKindT, LayerFxT, LayerT } from './engine/types'

type LayerStoreT = {
	layers: LayerT[]
	selectedLayerId: string | null
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

// Stored layers come back merged over fresh defaults, so older
// saves gain any field added since. The logo is always present.
const normalizeLayer = (stored: Partial<LayerT>): LayerT | null => {
	const kind = stored.kind
	const isKnownKind = kind === 'logo' || kind === 'text' || kind === 'image' || kind === 'svg'
	if (!isKnownKind) return null
	const base = kind === 'logo' ? createLogoLayer() : createTextLayer('')
	const transform = { ...base.transform, ...stored.transform }
	const modulations = { ...stored.modulations }
	const fx = Array.isArray(stored.fx) ? stored.fx : []
	const text = kind === 'text' ? { ...base.text, ...stored.text } : null
	const normalized = { ...base, ...stored, kind, transform, modulations, fx, text } as LayerT
	return normalized
}

const ensureLogoLayer = (layers: LayerT[]): LayerT[] => {
	const hasLogo = layers.some((layer) => layer.kind === 'logo')
	if (hasLogo) return layers
	return [...layers, createLogoLayer()]
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
		return ensureLogoLayer(layers)
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
	assetVersion: 0,
	isImporting: false
})

export const findLayer = (layerId: string | null): LayerT | undefined => {
	if (layerId === null) return undefined
	return layerStore.layers.find((layer) => layer.id === layerId)
}

export const getSelectedLayer = (): LayerT | undefined => findLayer(layerStore.selectedLayerId)

export const selectLayer = (layerId: string | null): void => {
	layerStore.selectedLayerId = layerId
}

// New layers land on top of the stack, in front of everything.
const pushLayer = (layer: LayerT): void => {
	layerStore.layers.push(layer)
	layerStore.selectedLayerId = layer.id
}

// The track title already has its own spot in the logo
// scene, so new text starts as a placeholder.
export const addTextLayer = (): void => {
	pushLayer(createTextLayer('Your text'))
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

export const removeLayer = (layerId: string): void => {
	const layer = findLayer(layerId)
	if (layer === undefined) return
	const isLogo = layer.id === LOGO_LAYER_ID
	if (isLogo) return
	layerStore.layers = layerStore.layers.filter((candidate) => candidate.id !== layerId)
	const wasSelected = layerStore.selectedLayerId === layerId
	if (wasSelected) layerStore.selectedLayerId = null
	const assetId = layer.assetId
	if (assetId !== null) void deleteAsset(assetId)
}

// forward moves toward the front, which is later in the list.
export const moveLayer = (layerId: string, direction: LayerDirectionT): void => {
	const index = layerStore.layers.findIndex((layer) => layer.id === layerId)
	if (index === -1) return
	const step = direction === 'forward' ? 1 : -1
	const targetIndex = index + step
	const isOutOfBounds = targetIndex < 0 || targetIndex >= layerStore.layers.length
	if (isOutOfBounds) return
	const reordered = [...layerStore.layers]
	const moving = reordered[index]
	reordered[index] = reordered[targetIndex]
	reordered[targetIndex] = moving
	layerStore.layers = reordered
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
	layer.isVisible = !layer.isVisible
}

export const addLayerFx = (layerId: string, kind: FxKindT): void => {
	const layer = findLayer(layerId)
	if (layer === undefined) return
	layer.fx.push(createFx(kind))
}

export const removeLayerFx = (layerId: string, fxId: string): void => {
	const layer = findLayer(layerId)
	if (layer === undefined) return
	layer.fx = layer.fx.filter((fx: LayerFxT) => fx.id !== fxId)
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
