import coreUrl from '../assets/logo-layers/core.png'
import fringeAUrl from '../assets/logo-layers/fringeA.png'
import fringeBUrl from '../assets/logo-layers/fringeB.png'
import silhouetteUrl from '../assets/logo-layers/sil.png'
import outlineUrl from '../assets/logo-layers/outline.png'
import haloUrl from '../assets/logo-layers/halo.png'
import backgroundUrl from '../assets/logo-layers/bg.jpg'
import layout from '../assets/logo-layers/layout.json'
import { createRandom } from './rng'
import { clamp } from './settings'

export const FRAME_WIDTH = layout.W
export const FRAME_HEIGHT = layout.H
export const LOGO_CENTER_X = layout.cx
export const LOGO_CENTER_Y = layout.cy

const DISTRESSED_CORE_VARIANTS = 4
const CORE_SPECK_COUNT = 9000
const OUTLINE_SPECK_COUNT = 15000
const SOLID_ALPHA_THRESHOLD = 100
// The background photo is the faint lyric pattern on near-white.
// Darkness against these two levels becomes the pattern's alpha.
const BACKGROUND_PAPER_LEVEL = 250
const BACKGROUND_INK_LEVEL = 40

export type BoundsT = {
	left: number
	top: number
	right: number
	bottom: number
}

export type LogoLayersT = {
	core: HTMLCanvasElement
	fringeA: HTMLCanvasElement
	fringeB: HTMLCanvasElement
	silhouette: HTMLCanvasElement
	outline: HTMLCanvasElement
	halo: HTMLCanvasElement
	coreVariants: HTMLCanvasElement[]
	outlineGritty: HTMLCanvasElement
	lyricPattern: HTMLCanvasElement
	grainTile: HTMLCanvasElement
	bounds: BoundsT
}

const createCanvas = (width: number, height: number): HTMLCanvasElement => {
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	return canvas
}

const getContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
	const context = canvas.getContext('2d', { willReadFrequently: false })
	if (context === null) throw new Error('2D canvas is not available')
	return context
}

const loadImage = (url: string): Promise<HTMLImageElement> => {
	return new Promise((resolve, reject) => {
		const image = new Image()
		image.onload = () => resolve(image)
		image.onerror = () => reject(new Error(`Could not load ${url}`))
		image.src = url
	})
}

// Every layer PNG is the same size and centered on the logo
// pivot, so each one lands in the shared frame at the same spot.
const placeLayer = async (url: string): Promise<HTMLCanvasElement> => {
	const image = await loadImage(url)
	const placed = createCanvas(FRAME_WIDTH, FRAME_HEIGHT)
	const left = Math.round(LOGO_CENTER_X - layout.w / 2)
	const top = Math.round(LOGO_CENTER_Y - layout.h / 2)
	getContext(placed).drawImage(image, left, top)
	return placed
}

// The faint lyric rows, as a white alpha mask that can be tinted
// with the foreground color. Already faded out around the logo.
const buildLyricPattern = async (): Promise<HTMLCanvasElement> => {
	const image = await loadImage(backgroundUrl)
	const pattern = createCanvas(FRAME_WIDTH, FRAME_HEIGHT)
	const context = getContext(pattern)
	context.drawImage(image, 0, 0, FRAME_WIDTH, FRAME_HEIGHT)
	const pixels = context.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT)
	const levelRange = BACKGROUND_PAPER_LEVEL - BACKGROUND_INK_LEVEL

	for (let offset = 0; offset < pixels.data.length; offset += 4) {
		const brightest = Math.max(pixels.data[offset], pixels.data[offset + 1], pixels.data[offset + 2])
		const darkness = clamp((BACKGROUND_PAPER_LEVEL - brightest) / levelRange, 0, 1)
		pixels.data[offset] = 255
		pixels.data[offset + 1] = 255
		pixels.data[offset + 2] = 255
		pixels.data[offset + 3] = Math.round(darkness * 255)
	}

	context.putImageData(pixels, 0, 0)
	return pattern
}

const findBounds = (mask: HTMLCanvasElement): BoundsT => {
	const pixels = getContext(mask).getImageData(0, 0, mask.width, mask.height)
	const bounds: BoundsT = { left: mask.width, top: mask.height, right: 0, bottom: 0 }

	for (let index = 0; index < mask.width * mask.height; index++) {
		const alpha = pixels.data[index * 4 + 3]
		const isSolid = alpha > SOLID_ALPHA_THRESHOLD
		if (!isSolid) continue
		const column = index % mask.width
		const row = Math.floor(index / mask.width)
		bounds.left = Math.min(bounds.left, column)
		bounds.right = Math.max(bounds.right, column)
		bounds.top = Math.min(bounds.top, row)
		bounds.bottom = Math.max(bounds.bottom, row)
	}

	return bounds
}

// Knocks random specks and short scratches out of a mask.
const distress = (mask: HTMLCanvasElement, bounds: BoundsT, count: number, seed: number): HTMLCanvasElement => {
	const worn = createCanvas(mask.width, mask.height)
	const context = getContext(worn)
	context.drawImage(mask, 0, 0)
	context.globalCompositeOperation = 'destination-out'
	context.fillStyle = '#fff'
	context.strokeStyle = '#fff'
	const random = createRandom(seed)
	const spanX = bounds.right - bounds.left
	const spanY = bounds.bottom - bounds.top

	for (let index = 0; index < count; index++) {
		const x = bounds.left + random() * spanX
		const y = bounds.top + random() * spanY
		const isSpeck = random() < 0.7
		if (isSpeck) {
			context.beginPath()
			context.arc(x, y, 0.5 + random() * 1.8, 0, Math.PI * 2)
			context.fill()
			continue
		}
		const angle = random() * Math.PI
		const length = 6 + random() * 26
		context.lineWidth = 0.8 + random()
		context.beginPath()
		context.moveTo(x, y)
		context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length)
		context.stroke()
	}

	return worn
}

const buildGrainTile = (): HTMLCanvasElement => {
	const size = 256
	const tile = createCanvas(size, size)
	const context = getContext(tile)
	const random = createRandom(31)
	context.fillStyle = '#fff'
	context.strokeStyle = '#fff'

	for (let index = 0; index < 420; index++) {
		context.globalAlpha = 0.35 + random() * 0.65
		context.beginPath()
		context.arc(random() * size, random() * size, 0.35 + random() * 0.8, 0, Math.PI * 2)
		context.fill()
	}

	for (let index = 0; index < 14; index++) {
		const x = random() * size
		const y = random() * size
		const angle = random() * Math.PI
		context.globalAlpha = 0.3 + random() * 0.4
		context.lineWidth = 0.6
		context.beginPath()
		context.moveTo(x, y)
		context.lineTo(x + Math.cos(angle) * (8 + random() * 22), y + Math.sin(angle) * (8 + random() * 22))
		context.stroke()
	}

	return tile
}

export const buildLogoLayers = async (): Promise<LogoLayersT> => {
	const core = await placeLayer(coreUrl)
	const fringeA = await placeLayer(fringeAUrl)
	const fringeB = await placeLayer(fringeBUrl)
	const silhouette = await placeLayer(silhouetteUrl)
	const outline = await placeLayer(outlineUrl)
	const halo = await placeLayer(haloUrl)
	const bounds = findBounds(silhouette)

	const coreVariants: HTMLCanvasElement[] = []
	for (let variant = 0; variant < DISTRESSED_CORE_VARIANTS; variant++) {
		coreVariants.push(distress(core, bounds, CORE_SPECK_COUNT, 101 + variant))
	}

	return {
		core,
		fringeA,
		fringeB,
		silhouette,
		outline,
		halo,
		coreVariants,
		outlineGritty: distress(outline, bounds, OUTLINE_SPECK_COUNT, 211),
		lyricPattern: await buildLyricPattern(),
		grainTile: buildGrainTile(),
		bounds
	}
}

// Tinting: every layer is a white alpha mask recolored at draw
// time. Results are cached by mask and color, and the cache is
// dropped wholesale when a color picker drag fills it up.
const tintCache = new Map<string, HTMLCanvasElement>()
const maskIds = new WeakMap<HTMLCanvasElement, number>()
const MAX_TINTED_LAYERS = 40
let nextMaskId = 1

const getMaskId = (mask: HTMLCanvasElement): number => {
	const existingId = maskIds.get(mask)
	if (existingId !== undefined) return existingId
	const newId = nextMaskId++
	maskIds.set(mask, newId)
	return newId
}

export const getTinted = (mask: HTMLCanvasElement, color: string): HTMLCanvasElement => {
	const key = `${getMaskId(mask)}|${color}`
	const cached = tintCache.get(key)
	if (cached !== undefined) return cached

	const isCacheFull = tintCache.size >= MAX_TINTED_LAYERS
	if (isCacheFull) tintCache.clear()

	const tinted = createCanvas(mask.width, mask.height)
	const context = getContext(tinted)
	context.drawImage(mask, 0, 0)
	context.globalCompositeOperation = 'source-in'
	context.fillStyle = color
	context.fillRect(0, 0, tinted.width, tinted.height)
	tintCache.set(key, tinted)
	return tinted
}

export const clearTintCache = (): void => {
	tintCache.clear()
}
