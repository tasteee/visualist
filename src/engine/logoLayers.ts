import haloUrl from '../assets/logo-layers/halo.png'
import backgroundUrl from '../assets/logo-layers/bg.jpg'
import layout from '../assets/logo-layers/layout.json'
import tracedPaths from '../assets/logo-layers/paths.json'
import { createRandom } from './rng'
import { clamp } from './settings'

export const FRAME_WIDTH = layout.W
export const FRAME_HEIGHT = layout.H
export const LOGO_CENTER_X = layout.cx
export const LOGO_CENTER_Y = layout.cy

const DISTRESSED_CORE_VARIANTS = 4
const CORE_SPECK_COUNT = 9000
const OUTLINE_SPECK_COUNT = 15000
const OUTLINE_WIDTH = 5
// Worn and gritty variants are rasters. They are rendered a little
// above the frame size so they stay sharp at 1080p output.
const RASTER_SCALE = 1.25
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

// A traced vector shape in frame coordinates. A line width of 0
// fills the shape, anything above strokes its edge.
export type VectorMaskT = {
	path: Path2D
	lineWidth: number
}

export type LogoLayersT = {
	core: VectorMaskT
	fringeA: VectorMaskT
	fringeB: VectorMaskT
	silhouette: VectorMaskT
	outline: VectorMaskT
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

const getLayerLeft = (): number => Math.round(LOGO_CENTER_X - layout.w / 2)
const getLayerTop = (): number => Math.round(LOGO_CENTER_Y - layout.h / 2)

// Raster layers are the same size and centered on the logo pivot.
const placeLayer = async (url: string): Promise<HTMLCanvasElement> => {
	const image = await loadImage(url)
	const placed = createCanvas(FRAME_WIDTH, FRAME_HEIGHT)
	getContext(placed).drawImage(image, getLayerLeft(), getLayerTop())
	return placed
}

const buildVectorMask = (pathData: string, lineWidth: number): VectorMaskT => {
	const path = new Path2D()
	const placement = new DOMMatrix([1, 0, 0, 1, getLayerLeft(), getLayerTop()])
	path.addPath(new Path2D(pathData), placement)
	return { path, lineWidth }
}

// Paints a vector mask in one color. Optionally slid sideways and
// cut to one horizontal strip, which is how glitching works.
export type StripT = {
	top: number
	height: number
}

const STRIP_OVERLAP = 0.5

export const paintMask = (
	context: CanvasRenderingContext2D,
	mask: VectorMaskT,
	color: string,
	offsetX = 0,
	strip?: StripT
): void => {
	context.save()
	if (strip !== undefined) {
		context.beginPath()
		context.rect(-FRAME_WIDTH, strip.top, FRAME_WIDTH * 3, strip.height + STRIP_OVERLAP)
		context.clip()
	}

	context.translate(offsetX, 0)
	const isStroke = mask.lineWidth > 0
	if (isStroke) {
		context.strokeStyle = color
		context.lineWidth = mask.lineWidth
		context.lineJoin = 'round'
		context.stroke(mask.path)
	}
	if (!isStroke) {
		context.fillStyle = color
		context.fill(mask.path, 'evenodd')
	}
	context.restore()
}

const rasterizeMask = (mask: VectorMaskT): HTMLCanvasElement => {
	const canvas = createCanvas(Math.round(FRAME_WIDTH * RASTER_SCALE), Math.round(FRAME_HEIGHT * RASTER_SCALE))
	const context = getContext(canvas)
	context.scale(RASTER_SCALE, RASTER_SCALE)
	paintMask(context, mask, '#fff')
	return canvas
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

// Knocks random specks and short scratches out of a mask.
const distress = (mask: HTMLCanvasElement, bounds: BoundsT, count: number, seed: number): HTMLCanvasElement => {
	const worn = createCanvas(mask.width, mask.height)
	const context = getContext(worn)
	const scale = mask.width / FRAME_WIDTH
	context.drawImage(mask, 0, 0)
	context.scale(scale, scale)
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
	const core = buildVectorMask(tracedPaths.core, 0)
	const fringeA = buildVectorMask(tracedPaths.fringeA, 0)
	const fringeB = buildVectorMask(tracedPaths.fringeB, 0)
	const silhouette = buildVectorMask(tracedPaths.sil, 0)
	const outline = buildVectorMask(tracedPaths.sil, OUTLINE_WIDTH)
	const halo = await placeLayer(haloUrl)

	const bounds: BoundsT = {
		left: tracedPaths.bounds.left + getLayerLeft(),
		right: tracedPaths.bounds.right + getLayerLeft(),
		top: tracedPaths.bounds.top + getLayerTop(),
		bottom: tracedPaths.bounds.bottom + getLayerTop()
	}

	const coreRaster = rasterizeMask(core)
	const coreVariants: HTMLCanvasElement[] = []
	for (let variant = 0; variant < DISTRESSED_CORE_VARIANTS; variant++) {
		coreVariants.push(distress(coreRaster, bounds, CORE_SPECK_COUNT, 101 + variant))
	}

	return {
		core,
		fringeA,
		fringeB,
		silhouette,
		outline,
		halo,
		coreVariants,
		outlineGritty: distress(rasterizeMask(outline), bounds, OUTLINE_SPECK_COUNT, 211),
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
const MAX_TINTED_LAYERS = 24
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
