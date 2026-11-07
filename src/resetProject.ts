// Everything the app keeps in this browser starts with this prefix.
const STORAGE_PREFIX = 'vink.'
const ASSET_DATABASE_NAME = 'vink-assets'

const clearLocalStorage = (): void => {
	const keys: string[] = []
	for (let index = 0; index < window.localStorage.length; index++) {
		const key = window.localStorage.key(index)
		const isOurs = key !== null && key.startsWith(STORAGE_PREFIX)
		if (isOurs) keys.push(key)
	}
	for (const key of keys) window.localStorage.removeItem(key)
}

const deleteAssetDatabase = (): Promise<void> => {
	return new Promise((resolve) => {
		const request = indexedDB.deleteDatabase(ASSET_DATABASE_NAME)
		request.onsuccess = () => resolve()
		request.onerror = () => resolve()
		request.onblocked = () => resolve()
	})
}

// Forgets the whole project, its song and its pictures, and reloads
// the app so it starts clean: a scene, and a post layer.
export const resetProject = async (): Promise<void> => {
	try {
		clearLocalStorage()
	} catch {
		// Storage can be blocked. The reload still starts from what it can read.
	}
	await deleteAssetDatabase()
	window.location.reload()
}
