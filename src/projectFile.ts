import { tick } from 'svelte'
import { saveProjectNow } from './project.svelte'
import { app } from './store.svelte'

type StoredAssetT = {
	key: string
	name: string | null
	type: string
	base64: string
}

type ProjectFileT = {
	format: 'visualist-project'
	version: 1
	storage: Record<string, string>
	assets: StoredAssetT[]
}

const DATABASE_NAME = 'vink-assets'
const STORE_NAME = 'files'
const STORAGE_PREFIX = 'vink.'
const FILE_EXTENSION = '.visualist.json'
const ENCODE_CHUNK_SIZE = 32766
const DECODE_CHUNK_SIZE = 32768

const readRequest = <ValueT>(request: IDBRequest<ValueT>): Promise<ValueT> => {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}

const openDatabase = (): Promise<IDBDatabase> => {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, 1)
		request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}

const encodeBlob = async (blob: Blob): Promise<string> => {
	const bytes = new Uint8Array(await blob.arrayBuffer())
	const chunks: string[] = []
	const chunkCount = Math.ceil(bytes.length / ENCODE_CHUNK_SIZE)
	const chunkIndices = Array.from({ length: chunkCount }, (unusedValue, index) => { return index })
	for (const chunkIndex of chunkIndices) {
		const offset = chunkIndex * ENCODE_CHUNK_SIZE
		const chunk = bytes.subarray(offset, offset + ENCODE_CHUNK_SIZE)
		chunks.push(btoa(String.fromCharCode(...chunk)))
	}
	return chunks.join('')
}

const decodeAsset = (asset: StoredAssetT): Blob => {
	const chunks: ArrayBuffer[] = []
	const chunkCount = Math.ceil(asset.base64.length / DECODE_CHUNK_SIZE)
	const chunkIndices = Array.from({ length: chunkCount }, (unusedValue, index) => { return index })
	for (const chunkIndex of chunkIndices) {
		const offset = chunkIndex * DECODE_CHUNK_SIZE
		const encodedChunk = asset.base64.slice(offset, offset + DECODE_CHUNK_SIZE)
		const binary = atob(encodedChunk)
		const buffer = new ArrayBuffer(binary.length)
		const bytes = Uint8Array.from(binary, (character) => { return character.charCodeAt(0) })
		new Uint8Array(buffer).set(bytes)
		chunks.push(buffer)
	}
	if (asset.name === null) return new Blob(chunks, { type: asset.type })
	return new File(chunks, asset.name, { type: asset.type })
}

const readAssets = async (): Promise<StoredAssetT[]> => {
	const database = await openDatabase()
	try {
		const transaction = database.transaction(STORE_NAME, 'readonly')
		const store = transaction.objectStore(STORE_NAME)
		const keysRequest = store.getAllKeys()
		const valuesRequest = store.getAll()
		const keysPromise = readRequest(keysRequest)
		const valuesPromise = readRequest(valuesRequest)
		const keys = await keysPromise
		const values = await valuesPromise
		const assets: StoredAssetT[] = []
		for (const entry of keys.entries()) {
			const index = entry[0]
			const key = entry[1]
			const blob = values[index]
			if (typeof key !== 'string' || !(blob instanceof Blob)) throw new Error('A stored media file could not be exported')
			const name = blob instanceof File ? blob.name : null
			assets.push({ key, name, type: blob.type, base64: await encodeBlob(blob) })
		}
		return assets
	} finally {
		database.close()
	}
}

const readStorage = (): Record<string, string> => {
	const storage: Record<string, string> = {}
	const indices = Array.from({ length: window.localStorage.length }, (unusedValue, index) => { return index })
	for (const index of indices) {
		const key = window.localStorage.key(index)
		if (key === null || !key.startsWith(STORAGE_PREFIX)) continue
		const value = window.localStorage.getItem(key)
		if (value !== null) storage[key] = value
	}
	return storage
}

const getFileName = (): string => {
	const cleanedName = app.projectName.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '')
	const baseName = cleanedName.length > 0 ? cleanedName : 'project'
	return `${baseName}${FILE_EXTENSION}`
}

export const exportProjectFile = async (): Promise<void> => {
	await tick()
	const wasSaved = saveProjectNow()
	if (!wasSaved) throw new Error('Browser storage is unavailable')
	const projectFile: ProjectFileT = {
		format: 'visualist-project',
		version: 1,
		storage: readStorage(),
		assets: await readAssets()
	}
	const blob = new Blob([JSON.stringify(projectFile)], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = getFileName()
	link.click()
	window.setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
}

const checkIsProjectFile = (value: unknown): value is ProjectFileT => {
	if (typeof value !== 'object' || value === null) return false
	const candidate = value as Partial<ProjectFileT>
	if (candidate.format !== 'visualist-project' || candidate.version !== 1) return false
	if (typeof candidate.storage !== 'object' || candidate.storage === null) return false
	if (!Array.isArray(candidate.assets)) return false
	const storageKeys = Object.keys(candidate.storage)
	const hasValidStorage = storageKeys.every((key) => key.startsWith(STORAGE_PREFIX) && typeof candidate.storage?.[key] === 'string')
	if (!hasValidStorage) return false
	const hasProjectState = storageKeys.includes('vink.project.v1') && storageKeys.includes('vink.layers.v1')
	if (!hasProjectState) return false
	return candidate.assets.every((asset) => {
		const hasKey = typeof asset.key === 'string'
		const hasName = asset.name === null || typeof asset.name === 'string'
		const hasType = typeof asset.type === 'string'
		const hasContent = typeof asset.base64 === 'string'
		return hasKey && hasName && hasType && hasContent
	})
}

const replaceAssets = async (assets: StoredAssetT[]): Promise<void> => {
	const decodedAssets = assets.map((asset) => { return { key: asset.key, blob: decodeAsset(asset) } })
	const database = await openDatabase()
	try {
		await new Promise<void>((resolve, reject) => {
			const transaction = database.transaction(STORE_NAME, 'readwrite')
			const store = transaction.objectStore(STORE_NAME)
			store.clear()
			for (const asset of decodedAssets) store.put(asset.blob, asset.key)
			transaction.oncomplete = () => resolve()
			transaction.onerror = () => reject(transaction.error)
			transaction.onabort = () => reject(transaction.error)
		})
	} finally {
		database.close()
	}
}

const replaceStorage = (storage: Record<string, string>): void => {
	const existingKeys = Object.keys(readStorage())
	for (const key of existingKeys) window.localStorage.removeItem(key)
	for (const key of Object.keys(storage)) window.localStorage.setItem(key, storage[key])
}

export const importProjectFile = async (file: File): Promise<void> => {
	const text = await file.text()
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		throw new Error('This is not a valid project file')
	}
	if (!checkIsProjectFile(parsed)) throw new Error('This project file is not supported')
	await replaceAssets(parsed.assets)
	replaceStorage(parsed.storage)
	window.location.reload()
}
