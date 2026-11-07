import { getIsClockRunning } from './audio'
import { readLayerFile, storeLayerFile } from './assets'
import { clamp } from './settings'

// Video files for layers. The original file is kept in IndexedDB
// under the layer's asset id. A hidden video element decodes it, and
// each frame is copied into a canvas that the renderer draws like a
// picture. Video layers are silent: the sound of a video is not played.

export type VideoAssetT = {
	id: string
	element: HTMLVideoElement
	canvas: HTMLCanvasElement
	duration: number
	url: string
	// The render pass that last drew this video.
	lastPassId: number
}

const MAX_FRAME_SIDE = 1280
// Playing video drifts from the audio clock a little. Past this, it
// is pulled back.
const DRIFT_LIMIT_SECONDS = 0.25
// While paused, a frame closer than this to the wanted time is kept.
const SEEK_TOLERANCE_SECONDS = 0.02
const END_GUARD_SECONDS = 0.05
const HAVE_CURRENT_DATA = 2

const videos = new Map<string, VideoAssetT>()
let passId = 0
let onFrameReady: () => void = () => {}

export const getVideo = (assetId: string | null): VideoAssetT | null => {
	if (assetId === null) return null
	return videos.get(assetId) ?? null
}

export const getVideoDuration = (assetId: string | null): number => getVideo(assetId)?.duration ?? 0

// A seek finishes after the frame was asked for, so the renderer
// is told to draw again once the new frame is ready.
export const setVideoFrameListener = (listener: () => void): void => {
	onFrameReady = listener
}

const loadMetadata = (element: HTMLVideoElement, url: string): Promise<void> => {
	return new Promise((resolve, reject) => {
		element.onloadeddata = () => resolve()
		element.onerror = () => reject(new Error('Could not decode the video'))
		element.src = url
		element.load()
	})
}

const createFrameCanvas = (element: HTMLVideoElement): HTMLCanvasElement => {
	const longestSide = Math.max(element.videoWidth, element.videoHeight)
	const scale = Math.min(1, MAX_FRAME_SIDE / Math.max(1, longestSide))
	const canvas = document.createElement('canvas')
	canvas.width = Math.max(1, Math.round(element.videoWidth * scale))
	canvas.height = Math.max(1, Math.round(element.videoHeight * scale))
	return canvas
}

const decodeVideoFile = async (assetId: string, file: Blob): Promise<VideoAssetT> => {
	const url = URL.createObjectURL(file)
	const element = document.createElement('video')
	element.muted = true
	element.playsInline = true
	element.preload = 'auto'
	try {
		await loadMetadata(element, url)
	} catch (error) {
		URL.revokeObjectURL(url)
		throw error
	}
	element.onerror = null
	element.onseeked = () => onFrameReady()
	const canvas = createFrameCanvas(element)
	const asset: VideoAssetT = { id: assetId, element, canvas, duration: element.duration, url, lastPassId: -1 }
	videos.set(assetId, asset)
	return asset
}

// Decodes first, so a broken file never reaches storage. The layer's
// asset id is the layer's own id, like audio layers.
export const importVideoFile = async (assetId: string, file: File): Promise<VideoAssetT> => {
	const asset = await decodeVideoFile(assetId, file)
	try {
		await storeLayerFile(assetId, file)
	} catch {
		console.warn('vink: could not store the video, it will be gone after a reload')
	}
	return asset
}

// Returns the ids that could not be restored.
export const restoreVideos = async (requests: { assetId: string; name: string }[]): Promise<string[]> => {
	const missingIds: string[] = []
	for (const request of requests) {
		const isDecoded = videos.has(request.assetId)
		if (isDecoded) continue
		try {
			const file = await readLayerFile(request.assetId, request.name)
			if (file === null) throw new Error('missing')
			await decodeVideoFile(request.assetId, file)
		} catch {
			missingIds.push(request.assetId)
		}
	}
	return missingIds
}

// A copy gets its own element and its own stored file, since an
// element can be at only one time.
export const copyVideo = async (fromAssetId: string, toAssetId: string, name: string): Promise<void> => {
	const file = await readLayerFile(fromAssetId, name)
	if (file === null) return
	await storeLayerFile(toAssetId, file)
	await decodeVideoFile(toAssetId, file)
}

export const beginVideoPass = (): void => {
	passId += 1
}

// Videos that were not drawn this pass stop playing.
export const endVideoPass = (): void => {
	for (const asset of videos.values()) {
		const wasDrawn = asset.lastPassId === passId
		if (wasDrawn) continue
		if (!asset.element.paused) asset.element.pause()
	}
}

const followClock = (asset: VideoAssetT, target: number): void => {
	const element = asset.element
	const isClockRunning = getIsClockRunning()
	if (!isClockRunning) {
		if (!element.paused) element.pause()
		const isFar = Math.abs(element.currentTime - target) > SEEK_TOLERANCE_SECONDS
		if (isFar) element.currentTime = target
		return
	}
	if (element.paused) {
		element.currentTime = target
		void element.play().catch(() => {})
		return
	}
	const isDrifting = Math.abs(element.currentTime - target) > DRIFT_LIMIT_SECONDS
	if (isDrifting) element.currentTime = target
}

// The video's frame for a moment on the project timeline, as a
// canvas. clipStart is where the clip begins on the timeline and
// sourceOffset how far into the file it begins.
export const getVideoFrame = (assetId: string | null, time: number, clipStart: number, sourceOffset: number): HTMLCanvasElement | null => {
	const asset = getVideo(assetId)
	if (asset === null) return null
	asset.lastPassId = passId
	const fileTime = time - clipStart + sourceOffset
	const target = clamp(fileTime, 0, Math.max(0, asset.duration - END_GUARD_SECONDS))
	followClock(asset, target)
	const hasFrame = asset.element.readyState >= HAVE_CURRENT_DATA
	if (!hasFrame) return asset.canvas
	const context = asset.canvas.getContext('2d')
	if (context === null) return asset.canvas
	context.drawImage(asset.element, 0, 0, asset.canvas.width, asset.canvas.height)
	return asset.canvas
}

export const getVideoSize = (assetId: string | null): { width: number; height: number } | null => {
	const asset = getVideo(assetId)
	if (asset === null) return null
	return { width: asset.canvas.width, height: asset.canvas.height }
}
