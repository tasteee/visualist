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
// Traced vector shapes are painted once into small canvases that
// cover only the logo, at 1.5 pixels per frame pixel. That stays
// sharp at 1080p, and drawing a canvas is far cheaper than
// filling a 190 KB path many times per frame.
const LAYER_SCALE = 1.5
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

// A mask canvas that covers part of the frame. left and top are
// where it sits in the frame, scale is canvas pixels per frame pixel.
export type LayerT = {
	canvas: HTMLCanvasElement
	left: number
	top: number
	scale: number
}

export type LogoLayersT = {
	core: LayerT
	fringeA: LayerT
	fringeB: LayerT
	silhouette: LayerT
	outline: LayerT
	halo: LayerT
	coreVariants: LayerT[]
	outlineGritty: LayerT
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

export const getLayerWidth = (layer: LayerT): number => layer.canvas.width / layer.scale
export const getLayerHeight = (layer: LayerT): number => layer.canvas.height / layer.scale

const loadHalo = async (): Promise<LayerT> => {
	const image = await loadImage(haloUrl)
	const canvas = createCanvas(image.naturalWidth, image.naturalHeight)
	getContext(canvas).drawImage(image, 0, 0)
	return { canvas, left: getLayerLeft(), top: getLayerTop(), scale: 1 }
}

// Paints a traced path (in layer pixels) as a white mask. A line
// width of 0 fills the shape, anything above strokes its edge.
const rasterizeTrace = (pathData: string, lineWidth: number): LayerT => {
	const canvas = createCanvas(Math.round(layout.w * LAYER_SCALE), Math.round(layout.h * LAYER_SCALE))
	const context = getContext(canvas)
	context.scale(LAYER_SCALE, LAYER_SCALE)
	const path = new Path2D(pathData)
	const isStroke = lineWidth > 0
	if (isStroke) {
		context.strokeStyle = '#fff'
		context.lineWidth = lineWidth
		context.lineJoin = 'round'
		context.stroke(path)
	}
	if (!isStroke) {
		context.fillStyle = '#fff'
		context.fill(path, 'evenodd')
	}
	return { canvas, left: getLayerLeft(), top: getLayerTop(), scale: LAYER_SCALE }
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

// Knocks random specks and short scratches out of a layer.
const distress = (layer: LayerT, bounds: BoundsT, count: number, seed: number): LayerT => {
	const worn = createCanvas(layer.canvas.width, layer.canvas.height)
	const context = getContext(worn)
	context.drawImage(layer.canvas, 0, 0)
	context.scale(layer.scale, layer.scale)
	context.translate(-layer.left, -layer.top)
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

	return { canvas: worn, left: layer.left, top: layer.top, scale: layer.scale }
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
	const core = rasterizeTrace(tracedPaths.core, 0)
	const fringeA = rasterizeTrace(tracedPaths.fringeA, 0)
	const fringeB = rasterizeTrace(tracedPaths.fringeB, 0)
	const silhouette = rasterizeTrace(tracedPaths.sil, 0)
	const outline = rasterizeTrace(tracedPaths.sil, OUTLINE_WIDTH)
	const halo = await loadHalo()

	const bounds: BoundsT = {
		left: tracedPaths.bounds.left + getLayerLeft(),
		right: tracedPaths.bounds.right + getLayerLeft(),
		top: tracedPaths.bounds.top + getLayerTop(),
		bottom: tracedPaths.bounds.bottom + getLayerTop()
	}

	const coreVariants: LayerT[] = []
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

export const tintLayer = (layer: LayerT, color: string): LayerT => {
	const canvas = getTinted(layer.canvas, color)
	return { canvas, left: layer.left, top: layer.top, scale: layer.scale }
}
