import { createRandom } from './rng'
import { clamp } from './settings'

export const FRAME_WIDTH = 1600
export const FRAME_HEIGHT = 900
export const LOGO_CENTER_X = FRAME_WIDTH / 2
export const LOGO_CENTER_Y = 395

const DISTRESSED_CORE_VARIANTS = 4
const CORE_SPECK_COUNT = 9000
const OUTLINE_SPECK_COUNT = 15000
const OUTLINE_RADIUS = 2.5
const HALO_GROW = 16
const HALO_SOFTNESS = 6
const FADE_ZONE_GROW = 110
const FADE_ZONE_SOFTNESS = 60

// Drop a file named logo.png (or .webp / .jpg) into src/assets and
// it is used as the source. Without one, a generated wordmark in
// the same colors goes through the very same pipeline.
const bundledLogoUrls = import.meta.glob('../assets/logo.{png,webp,jpg,jpeg}', {
	eager: true,
	query: '?url',
	import: 'default'
}) as Record<string, string>

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
	isGenerated: boolean
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

const generateFallbackSource = async (): Promise<HTMLCanvasElement> => {
	await document.fonts.load('900 300px "DM Sans"')
	const width = 1600
	const height = 1200
	const canvas = createCanvas(width, height)
	const context = getContext(canvas)
	context.fillStyle = 'rgb(249, 249, 250)'
	context.fillRect(0, 0, width, height)

	const drawWordmark = (color: string, shiftX: number, shiftY: number) => {
		context.save()
		context.translate(width / 2 + shiftX, height / 2 + 40 + shiftY)
		context.rotate(-0.045)
		context.fillStyle = color
		context.textBaseline = 'alphabetic'
		context.font = '900 250px "DM Sans", Arial Black, sans-serif'
		context.letterSpacing = '-14px'
		const tasteWidth = context.measureText('taste').width
		context.fillText('taste', -430, 0)
		context.font = 'italic 300 330px "Georgia", "Times New Roman", serif'
		context.letterSpacing = '-10px'
		context.fillText('ink', -430 + tasteWidth + 10, 10)
		context.restore()
	}

	drawWordmark('rgb(245, 70, 205)', 5, 4)
	drawWordmark('rgb(10, 245, 180)', -4, -3)
	drawWordmark('rgb(40, 0, 28)', 0, 0)
	return canvas
}

const loadLogoSource = async (): Promise<{ canvas: HTMLCanvasElement; isGenerated: boolean }> => {
	const urls = Object.values(bundledLogoUrls)
	const firstUrl = urls[0]
	if (firstUrl === undefined) return { canvas: await generateFallbackSource(), isGenerated: true }

	const image = await loadImage(firstUrl)
	const canvas = createCanvas(image.naturalWidth, image.naturalHeight)
	getContext(canvas).drawImage(image, 0, 0)
	return { canvas, isGenerated: false }
}

type MaskPixelsT = {
	core: ImageData
	fringeA: ImageData
	fringeB: ImageData
	silhouette: ImageData
	bounds: BoundsT
}

// Splits the raster into masks by color. The near-black core has
// the lowest brightest-channel, magenta and cyan are saturated
// and bright, and the paper and lyric text are bright and gray.
const splitByColor = (source: ImageData): MaskPixelsT => {
	const width = source.width
	const height = source.height
	const pixels = source.data
	const core = new ImageData(width, height)
	const fringeA = new ImageData(width, height)
	const fringeB = new ImageData(width, height)
	const silhouette = new ImageData(width, height)
	const backgroundBrightness = 250
	const inkBrightness = 40
	const coreFloor = 25
	const bounds: BoundsT = { left: width, top: height, right: 0, bottom: 0 }

	for (let index = 0; index < width * height; index++) {
		const offset = index * 4
		const red = pixels[offset]
		const green = pixels[offset + 1]
		const blue = pixels[offset + 2]
		const brightest = Math.max(red, green, blue)
		const magentaness = (red + blue) / 2 - green
		const cyanness = (green + blue) / 2 - red

		const coreRange = backgroundBrightness - inkBrightness - coreFloor
		const coreAlpha = clamp((backgroundBrightness - brightest - coreFloor) / coreRange, 0, 1)
		const fringeAAlpha = clamp((magentaness - 45) / 105, 0, 1)
		const fringeBAlpha = clamp((cyanness - 30) / 170, 0, 1)
		const silhouetteAlpha = Math.max(coreAlpha, fringeAAlpha, fringeBAlpha)

		const writeAlpha = (target: ImageData, alpha: number) => {
			target.data[offset] = 255
			target.data[offset + 1] = 255
			target.data[offset + 2] = 255
			target.data[offset + 3] = Math.round(alpha * 255)
		}
		writeAlpha(core, coreAlpha)
		writeAlpha(fringeA, fringeAAlpha)
		writeAlpha(fringeB, fringeBAlpha)
		writeAlpha(silhouette, silhouetteAlpha)

		const isSolid = silhouetteAlpha > 0.4
		if (!isSolid) continue
		const column = index % width
		const row = Math.floor(index / width)
		bounds.left = Math.min(bounds.left, column)
		bounds.right = Math.max(bounds.right, column)
		bounds.top = Math.min(bounds.top, row)
		bounds.bottom = Math.max(bounds.bottom, row)
	}

	return { core, fringeA, fringeB, silhouette, bounds }
}

// Puts a mask into the shared 1600x900 frame, with the logo's
// bounding box centered on the logo pivot.
const placeMask = (mask: ImageData, shiftX: number, shiftY: number): HTMLCanvasElement => {
	const staging = createCanvas(mask.width, mask.height)
	getContext(staging).putImageData(mask, 0, 0)
	const placed = createCanvas(FRAME_WIDTH, FRAME_HEIGHT)
	getContext(placed).drawImage(staging, shiftX, shiftY)
	return placed
}

const ringOffsets = (radius: number, count: number): [number, number][] => {
	const offsets: [number, number][] = []
	for (let step = 0; step < count; step++) {
		const angle = (step / count) * Math.PI * 2
		offsets.push([Math.cos(angle) * radius, Math.sin(angle) * radius])
	}
	return offsets
}

const dilate = (mask: HTMLCanvasElement, radius: number): HTMLCanvasElement => {
	const grown = createCanvas(mask.width, mask.height)
	const context = getContext(grown)
	context.drawImage(mask, 0, 0)
	const rings = [radius, radius * 0.66, radius * 0.33]
	for (const ringRadius of rings) {
		const count = Math.max(8, Math.round(ringRadius * 0.6))
		for (const offset of ringOffsets(ringRadius, count)) context.drawImage(mask, offset[0], offset[1])
	}
	return grown
}

const erode = (mask: HTMLCanvasElement, radius: number): HTMLCanvasElement => {
	const shrunk = createCanvas(mask.width, mask.height)
	const context = getContext(shrunk)
	context.drawImage(mask, 0, 0)
	context.globalCompositeOperation = 'destination-in'
	for (const offset of ringOffsets(radius, 12)) context.drawImage(mask, offset[0], offset[1])
	return shrunk
}

const soften = (mask: HTMLCanvasElement, blurRadius: number): HTMLCanvasElement => {
	const softened = createCanvas(mask.width, mask.height)
	const context = getContext(softened)
	context.filter = `blur(${blurRadius}px)`
	context.drawImage(mask, 0, 0)
	return softened
}

const buildOutline = (silhouette: HTMLCanvasElement): HTMLCanvasElement => {
	const outer = dilate(silhouette, OUTLINE_RADIUS)
	const inner = erode(silhouette, OUTLINE_RADIUS)
	const context = getContext(outer)
	context.globalCompositeOperation = 'destination-out'
	context.drawImage(inner, 0, 0)
	return outer
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

const LYRICS = [
	'promise i will take you there',
	'so here i am alive at last',
	'and i will savor every moment of this',
	'as long as you are alive',
	'when i am standing on top of the world',
	'i will take your hand and keep you there'
]

// Faint rows of lyric text, fading to clean space around the logo.
const buildLyricPattern = (silhouette: HTMLCanvasElement): HTMLCanvasElement => {
	const pattern = createCanvas(FRAME_WIDTH, FRAME_HEIGHT)
	const context = getContext(pattern)
	const random = createRandom(7)
	context.fillStyle = '#fff'
	context.textBaseline = 'middle'
	context.font = '400 64px "DM Sans", Arial, sans-serif'
	context.letterSpacing = '26px'
	const rowHeight = 92
	const rowCount = Math.ceil(FRAME_HEIGHT / rowHeight) + 1

	for (let row = 0; row < rowCount; row++) {
		const line = LYRICS[row % LYRICS.length]
		const startX = -random() * 600
		context.fillText(line, startX, row * rowHeight + 20)
	}

	const fadeZone = soften(dilate(silhouette, FADE_ZONE_GROW), FADE_ZONE_SOFTNESS)
	context.globalCompositeOperation = 'destination-out'
	context.drawImage(fadeZone, 0, 0)
	return pattern
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
	const source = await loadLogoSource()
	const sourceContext = getContext(source.canvas)
	const sourcePixels = sourceContext.getImageData(0, 0, source.canvas.width, source.canvas.height)
	const masks = splitByColor(sourcePixels)

	const centerX = (masks.bounds.left + masks.bounds.right) / 2
	const centerY = (masks.bounds.top + masks.bounds.bottom) / 2
	const shiftX = Math.round(LOGO_CENTER_X - centerX)
	const shiftY = Math.round(LOGO_CENTER_Y - centerY)
	const bounds: BoundsT = {
		left: masks.bounds.left + shiftX,
		right: masks.bounds.right + shiftX,
		top: masks.bounds.top + shiftY,
		bottom: masks.bounds.bottom + shiftY
	}

	const core = placeMask(masks.core, shiftX, shiftY)
	const fringeA = placeMask(masks.fringeA, shiftX, shiftY)
	const fringeB = placeMask(masks.fringeB, shiftX, shiftY)
	const silhouette = placeMask(masks.silhouette, shiftX, shiftY)
	const outline = buildOutline(silhouette)
	const halo = soften(dilate(silhouette, HALO_GROW), HALO_SOFTNESS)

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
		lyricPattern: buildLyricPattern(silhouette),
		grainTile: buildGrainTile(),
		bounds,
		isGenerated: source.isGenerated
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
