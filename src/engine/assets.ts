// Image and SVG files for layers. The original file is kept in
// IndexedDB so layers survive a reload. A decoded copy, painted
// into a canvas, is what the renderer draws.

export type AssetKindT = 'image' | 'svg'

export type AssetT = {
	id: string
	kind: AssetKindT
	canvas: HTMLCanvasElement
}

const DATABASE_NAME = 'vink-assets'
const STORE_NAME = 'files'
const MAX_RASTER_SIDE = 2048
// SVGs have no fixed size, so they are painted large and sharp.
const SVG_RASTER_SIDE = 2048
const SVG_FALLBACK_SIDE = 1024

const decodedAssets = new Map<string, AssetT>()

export const getAsset = (assetId: string | null): AssetT | null => {
	if (assetId === null) return null
	return decodedAssets.get(assetId) ?? null
}

export const checkIsSvgFile = (file: File): boolean => {
	const isSvgType = file.type === 'image/svg+xml'
	const hasSvgExtension = file.name.toLowerCase().endsWith('.svg')
	return isSvgType || hasSvgExtension
}

const openDatabase = (): Promise<IDBDatabase> => {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, 1)
		request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}

const runRequest = <ResultT>(request: IDBRequest<ResultT>): Promise<ResultT> => {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}

const getStore = async (mode: IDBTransactionMode): Promise<IDBObjectStore> => {
	const database = await openDatabase()
	const transaction = database.transaction(STORE_NAME, mode)
	return transaction.objectStore(STORE_NAME)
}

const saveFile = async (assetId: string, file: Blob): Promise<void> => {
	const store = await getStore('readwrite')
	await runRequest(store.put(file, assetId))
}

const readFile = async (assetId: string): Promise<Blob | null> => {
	const store = await getStore('readonly')
	const stored = await runRequest(store.get(assetId))
	const isBlob = stored instanceof Blob
	if (!isBlob) return null
	return stored
}

const removeFile = async (assetId: string): Promise<void> => {
	const store = await getStore('readwrite')
	await runRequest(store.delete(assetId))
}

const loadImage = (url: string): Promise<HTMLImageElement> => {
	return new Promise((resolve, reject) => {
		const image = new Image()
		image.onload = () => resolve(image)
		image.onerror = () => reject(new Error('Could not decode the file'))
		image.src = url
	})
}

type RasterSizeT = {
	width: number
	height: number
}

const getRasterSize = (image: HTMLImageElement, kind: AssetKindT): RasterSizeT => {
	const hasNaturalSize = image.naturalWidth > 0 && image.naturalHeight > 0
	const naturalWidth = hasNaturalSize ? image.naturalWidth : SVG_FALLBACK_SIDE
	const naturalHeight = hasNaturalSize ? image.naturalHeight : SVG_FALLBACK_SIDE
	const longestSide = Math.max(naturalWidth, naturalHeight)
	const isSvg = kind === 'svg'
	const targetSide = isSvg ? SVG_RASTER_SIDE : Math.min(MAX_RASTER_SIDE, longestSide)
	const scale = targetSide / longestSide
	const width = Math.max(1, Math.round(naturalWidth * scale))
	const height = Math.max(1, Math.round(naturalHeight * scale))
	return { width, height }
}

const decodeFile = async (assetId: string, kind: AssetKindT, file: Blob): Promise<AssetT> => {
	const url = URL.createObjectURL(file)
	try {
		const image = await loadImage(url)
		const size = getRasterSize(image, kind)
		const canvas = document.createElement('canvas')
		canvas.width = size.width
		canvas.height = size.height
		const context = canvas.getContext('2d')
		if (context === null) throw new Error('2D canvas is not available')
		context.drawImage(image, 0, 0, size.width, size.height)
		return { id: assetId, kind, canvas }
	} finally {
		URL.revokeObjectURL(url)
	}
}

// Decodes first, so a broken file never reaches storage.
// Storage can be blocked: the asset then lasts this session.
export const importAssetFile = async (file: File): Promise<AssetT> => {
	const assetId = crypto.randomUUID()
	const kind: AssetKindT = checkIsSvgFile(file) ? 'svg' : 'image'
	const asset = await decodeFile(assetId, kind, file)
	decodedAssets.set(assetId, asset)
	try {
		await saveFile(assetId, file)
	} catch {
		console.warn('vink: could not store the layer file, it will be gone after a reload')
	}
	return asset
}

const restoreAsset = async (assetId: string, kind: AssetKindT): Promise<boolean> => {
	const isDecoded = decodedAssets.has(assetId)
	if (isDecoded) return true
	const file = await readFile(assetId)
	if (file === null) return false
	const asset = await decodeFile(assetId, kind, file)
	decodedAssets.set(assetId, asset)
	return true
}

export type AssetRequestT = {
	assetId: string
	kind: AssetKindT
}

// Returns the ids that could not be restored.
export const restoreAssets = async (requests: AssetRequestT[]): Promise<string[]> => {
	const missingIds: string[] = []
	for (const request of requests) {
		try {
			const isRestored = await restoreAsset(request.assetId, request.kind)
			if (!isRestored) missingIds.push(request.assetId)
		} catch {
			missingIds.push(request.assetId)
		}
	}
	return missingIds
}

export const deleteAsset = async (assetId: string): Promise<void> => {
	decodedAssets.delete(assetId)
	try {
		await removeFile(assetId)
	} catch {
		console.warn('vink: could not remove a stored layer file')
	}
}
