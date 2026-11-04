import { getAsset } from './assets'
import type { FrameLayoutT } from './formats'
import { LAYER_PARAMS, getBlendOperation, getTimeRangeLevel } from './layers'
import { getTinted } from './logoLayers'
import { applyModulation } from './modulation'
import { createRandom } from './rng'
import { FLICKER_RATE, clamp } from './settings'
import type { FxKindT, LayerT, LayerTransformT, PaletteSlotT, PaletteT, SignalsT, TextContentT } from './types'

// A drawable layer picture. width and height are in frame units,
// the canvas itself may hold more pixels than that.
type LayerSourceT = {
	canvas: HTMLCanvasElement
	width: number
	height: number
}

type ResolvedFxT = Record<FxKindT, number>

type LayerPassT = {
	layer: LayerT
	transform: LayerTransformT
	fx: ResolvedFxT
	alpha: number
	seed: number
	flickerStep: number
}

export type LayerStackInputT = {
	layers: LayerT[]
	time: number
	signals: SignalsT
	palette: PaletteT
	frame: FrameLayoutT
	drawLogo: (context: CanvasRenderingContext2D) => void
}

// Text is painted at this many pixels per frame unit, so it
// stays sharp when scaled up or exported at 1080.
const TEXT_RASTER_SCALE = 2.5
const TEXT_FONT_SIZE = 72
const TEXT_LINE_HEIGHT = 1.12
const MAX_TEXT_CANVAS_SIDE = 8192
const MAX_TEXT_CACHE = 30
// Images and SVGs at scale 1 fill this share of the frame's
// short side along their own longest side.
const ASSET_FIT_SHARE = 0.5
const GLITCH_STRIPS = 14

const textCache = new Map<string, LayerSourceT>()
const scratchCanvases: HTMLCanvasElement[] = []
let logoCanvas: HTMLCanvasElement | null = null

const createCanvas = (width: number, height: number): HTMLCanvasElement => {
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	return canvas
}

const getContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
	const context = canvas.getContext('2d')
	if (context === null) throw new Error('2D canvas is not available')
	return context
}

const getPaletteColor = (palette: PaletteT, slot: PaletteSlotT): string => palette[slot]

const getShortSide = (frame: FrameLayoutT): number => Math.min(frame.width, frame.height)

// A stable number per layer, so its random jitter differs from
// other layers but repeats exactly frame to frame.
const getLayerSeed = (layerId: string): number => {
	let hash = 2166136261
	for (const character of layerId) {
		hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
	}
	return hash >>> 0
}

// ---- Sources -------------------------------------------------

const setTextFont = (context: CanvasRenderingContext2D, content: TextContentT, size: number): void => {
	context.font = `${content.weight} ${size}px "DM Sans", system-ui, sans-serif`
	const tracking = content.isUppercase ? 0.08 : 0
	context.letterSpacing = `${size * tracking}px`
}

const getDisplayText = (content: TextContentT): string => {
	if (content.isUppercase) return content.text.toUpperCase()
	return content.text
}

const paintText = (content: TextContentT, color: string): LayerSourceT => {
	const lines = getDisplayText(content).split('\n')
	const measureContext = getContext(createCanvas(1, 1))
	setTextFont(measureContext, content, TEXT_FONT_SIZE)
	const lineWidths = lines.map((line) => measureContext.measureText(line).width)
	const widestLine = Math.max(1, ...lineWidths)
	const lineHeight = TEXT_FONT_SIZE * TEXT_LINE_HEIGHT
	const padding = TEXT_FONT_SIZE * 0.2
	const unitWidth = widestLine + padding * 2
	const unitHeight = lines.length * lineHeight + padding * 2

	const longestSide = Math.max(unitWidth, unitHeight)
	const rasterScale = Math.min(TEXT_RASTER_SCALE, MAX_TEXT_CANVAS_SIDE / longestSide)
	const canvas = createCanvas(Math.ceil(unitWidth * rasterScale), Math.ceil(unitHeight * rasterScale))
	const context = getContext(canvas)
	context.scale(rasterScale, rasterScale)
	setTextFont(context, content, TEXT_FONT_SIZE)
	context.fillStyle = color
	context.textAlign = 'center'
	context.textBaseline = 'middle'

	const centerX = unitWidth / 2
	for (const [lineIndex, line] of lines.entries()) {
		const lineCenterY = padding + lineHeight * (lineIndex + 0.5)
		context.fillText(line, centerX, lineCenterY)
	}
	return { canvas, width: unitWidth, height: unitHeight }
}

const getTextSource = (content: TextContentT, palette: PaletteT): LayerSourceT | null => {
	const isEmpty = content.text.trim().length === 0
	if (isEmpty) return null
	const color = getPaletteColor(palette, content.color)
	const cacheKey = `${content.text}|${content.weight}|${content.isUppercase}|${color}`
	const cached = textCache.get(cacheKey)
	if (cached !== undefined) return cached
	const isCacheFull = textCache.size >= MAX_TEXT_CACHE
	if (isCacheFull) textCache.clear()
	const painted = paintText(content, color)
	textCache.set(cacheKey, painted)
	return painted
}

const getSvgTint = (layer: LayerT, palette: PaletteT): string | null => {
	const isSvg = layer.kind === 'svg'
	if (!isSvg) return null
	const slot = layer.svgColor
	if (slot === 'original') return null
	return getPaletteColor(palette, slot)
}

const getAssetSource = (layer: LayerT, palette: PaletteT, frame: FrameLayoutT): LayerSourceT | null => {
	const asset = getAsset(layer.assetId)
	if (asset === null) return null
	const tintColor = getSvgTint(layer, palette)
	const canvas = tintColor === null ? asset.canvas : getTinted(asset.canvas, tintColor)
	const longestPixelSide = Math.max(canvas.width, canvas.height)
	const fitSide = getShortSide(frame) * ASSET_FIT_SHARE
	const unitsPerPixel = fitSide / longestPixelSide
	return { canvas, width: canvas.width * unitsPerPixel, height: canvas.height * unitsPerPixel }
}

// The built-in logo scene is painted into a frame-sized canvas
// when it needs a transform, a blend or FX.
const getLogoSource = (target: CanvasRenderingContext2D, input: LayerStackInputT): LayerSourceT => {
	const pixelWidth = target.canvas.width
	const pixelHeight = target.canvas.height
	const canvas = logoCanvas ?? createCanvas(pixelWidth, pixelHeight)
	logoCanvas = canvas
	const hasWrongSize = canvas.width !== pixelWidth || canvas.height !== pixelHeight
	if (hasWrongSize) {
		canvas.width = pixelWidth
		canvas.height = pixelHeight
	}

	const context = getContext(canvas)
	context.setTransform(1, 0, 0, 1, 0, 0)
	context.clearRect(0, 0, pixelWidth, pixelHeight)
	context.setTransform(target.getTransform())
	context.globalAlpha = 1
	context.globalCompositeOperation = 'source-over'
	input.drawLogo(context)
	return { canvas, width: input.frame.width, height: input.frame.height }
}

const getLayerSource = (target: CanvasRenderingContext2D, layer: LayerT, input: LayerStackInputT): LayerSourceT | null => {
	const isLogo = layer.kind === 'logo'
	if (isLogo) return getLogoSource(target, input)
	const isText = layer.kind === 'text'
	if (!isText) return getAssetSource(layer, input.palette, input.frame)
	const content = layer.text
	if (content === null) return null
	return getTextSource(content, input.palette)
}

// Logo layers change every frame, so their tints are painted
// fresh into reused scratch canvases instead of the tint cache.
const tintFreshly = (source: LayerSourceT, color: string, slot: number): HTMLCanvasElement => {
	const isMissing = scratchCanvases[slot] === undefined
	if (isMissing) scratchCanvases[slot] = createCanvas(source.canvas.width, source.canvas.height)
	const canvas = scratchCanvases[slot]
	canvas.width = source.canvas.width
	canvas.height = source.canvas.height
	const context = getContext(canvas)
	context.drawImage(source.canvas, 0, 0)
	context.globalCompositeOperation = 'source-in'
	context.fillStyle = color
	context.fillRect(0, 0, canvas.width, canvas.height)
	return canvas
}

const tintSource = (source: LayerSourceT, color: string, isDynamic: boolean, slot: number): HTMLCanvasElement => {
	if (isDynamic) return tintFreshly(source, color, slot)
	return getTinted(source.canvas, color)
}

const getScratch = (slot: number, width: number, height: number): HTMLCanvasElement => {
	const isMissing = scratchCanvases[slot] === undefined
	if (isMissing) scratchCanvases[slot] = createCanvas(width, height)
	const canvas = scratchCanvases[slot]
	const hasSize = canvas.width === width && canvas.height === height
	if (!hasSize) {
		canvas.width = width
		canvas.height = height
	}
	const context = getContext(canvas)
	context.setTransform(1, 0, 0, 1, 0, 0)
	context.globalCompositeOperation = 'source-over'
	context.filter = 'none'
	context.clearRect(0, 0, width, height)
	return canvas
}

type SoftCopyT = {
	canvas: HTMLCanvasElement
	width: number
	height: number
}

const SOFT_SLOT_TINT = 3
const SOFT_SLOT_BLUR = 4

// A blurred, optionally tinted copy painted at a fraction of
// the output size. Blur cost grows with pixels times radius, so
// this is many times cheaper than blurring at full size, and
// upscaling a blur loses nothing you can see. The copy carries
// a margin so the blur never clips at the layer's edges.
const buildSoftCopy = (source: LayerSourceT, color: string | null, radius: number, pixelScale: number): SoftCopyT => {
	const downscale = clamp(radius / 3, 1, 4)
	const smallRadius = radius / downscale
	const margin = Math.ceil(smallRadius * 2)
	const innerWidth = Math.max(1, Math.round((source.width * pixelScale) / downscale))
	const innerHeight = Math.max(1, Math.round((source.height * pixelScale) / downscale))
	const width = innerWidth + margin * 2
	const height = innerHeight + margin * 2

	const hasTint = color !== null
	const tinted = hasTint ? getScratch(SOFT_SLOT_TINT, width, height) : null
	if (tinted !== null && color !== null) {
		const tintContext = getContext(tinted)
		tintContext.drawImage(source.canvas, margin, margin, innerWidth, innerHeight)
		tintContext.globalCompositeOperation = 'source-in'
		tintContext.fillStyle = color
		tintContext.fillRect(0, 0, width, height)
	}

	const blurred = getScratch(SOFT_SLOT_BLUR, width, height)
	const blurContext = getContext(blurred)
	blurContext.filter = `blur(${smallRadius.toFixed(2)}px)`
	if (tinted !== null) blurContext.drawImage(tinted, 0, 0)
	if (tinted === null) blurContext.drawImage(source.canvas, margin, margin, innerWidth, innerHeight)
	blurContext.filter = 'none'

	const unitsPerPixel = downscale / pixelScale
	return { canvas: blurred, width: width * unitsPerPixel, height: height * unitsPerPixel }
}

const toBlurredSource = (source: LayerSourceT, radius: number, pixelScale: number): LayerSourceT => {
	const copy = buildSoftCopy(source, null, radius, pixelScale)
	return { canvas: copy.canvas, width: copy.width, height: copy.height }
}

const drawSoftCopy = (context: CanvasRenderingContext2D, copy: SoftCopyT): void => {
	context.drawImage(copy.canvas, -copy.width / 2, -copy.height / 2, copy.width, copy.height)
}

// ---- Resolving params -----------------------------------------

const resolveTransform = (layer: LayerT, signals: SignalsT): LayerTransformT => {
	const resolved: LayerTransformT = { ...layer.transform }
	for (const spec of LAYER_PARAMS) {
		const modulation = layer.modulations[spec.key]
		resolved[spec.key] = applyModulation(layer.transform[spec.key], spec, modulation, signals)
	}
	return resolved
}

const createEmptyFx = (): ResolvedFxT => ({ glow: 0, split: 0, glitch: 0, shake: 0, flicker: 0, blur: 0 })

// Two copies of one FX add up, capped at full strength.
const resolveFx = (layer: LayerT, signals: SignalsT): ResolvedFxT => {
	const resolved = createEmptyFx()
	const range = { min: 0, max: 1 }
	for (const fx of layer.fx) {
		const amount = applyModulation(fx.amount, range, fx.modulation, signals)
		resolved[fx.kind] = clamp(resolved[fx.kind] + amount, 0, 1)
	}
	return resolved
}

const checkHasFx = (fx: ResolvedFxT): boolean => Object.values(fx).some((amount) => amount > 0)

const checkIsIdentity = (transform: LayerTransformT): boolean => {
	const isCentered = transform.x === 0 && transform.y === 0
	const isUnscaled = transform.scale === 1 && transform.rotation === 0
	return isCentered && isUnscaled
}

// The untouched logo draws straight onto the frame, the exact
// path it always took, so the classic look costs nothing extra.
const checkIsPlainLogo = (pass: LayerPassT): boolean => {
	const isLogo = pass.layer.kind === 'logo'
	const isOpaque = pass.alpha >= 1
	const isNormalBlend = pass.layer.blend === 'normal'
	const hasFx = checkHasFx(pass.fx)
	return isLogo && isOpaque && isNormalBlend && !hasFx && checkIsIdentity(pass.transform)
}

const buildPass = (layer: LayerT, input: LayerStackInputT): LayerPassT | null => {
	if (!layer.isVisible) return null
	const timeLevel = getTimeRangeLevel(layer, input.time)
	const isOutOfRange = timeLevel <= 0
	if (isOutOfRange) return null
	const transform = resolveTransform(layer, input.signals)
	const alpha = clamp(transform.opacity, 0, 1) * timeLevel
	const isInvisible = alpha <= 0
	if (isInvisible) return null
	const fx = resolveFx(layer, input.signals)
	const seed = getLayerSeed(layer.id)
	const flickerStep = Math.floor(input.time * FLICKER_RATE)
	return { layer, transform, fx, alpha, seed, flickerStep }
}

// ---- Drawing --------------------------------------------------

const getPixelScale = (context: CanvasRenderingContext2D): number => {
	const transform = context.getTransform()
	return Math.hypot(transform.a, transform.b)
}

const drawCentered = (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, source: LayerSourceT, offsetX: number): void => {
	context.drawImage(canvas, -source.width / 2 + offsetX, -source.height / 2, source.width, source.height)
}

const drawGlitched = (context: CanvasRenderingContext2D, source: LayerSourceT, pass: LayerPassT): void => {
	const random = createRandom(pass.seed + pass.flickerStep * 7919)
	const isGlitchFrame = random() < 0.35 + 0.65 * pass.fx.glitch
	if (!isGlitchFrame) return drawCentered(context, source.canvas, source, 0)

	const maxShift = source.width * 0.12 * pass.fx.glitch
	const stripUnitHeight = source.height / GLITCH_STRIPS
	const stripPixelHeight = source.canvas.height / GLITCH_STRIPS
	const stripNumbers = Array.from({ length: GLITCH_STRIPS }, (_, stripIndex) => stripIndex)
	for (const stripIndex of stripNumbers) {
		const isShifted = random() < 0.55
		const rawShift = (random() * 2 - 1) * maxShift
		const shift = isShifted ? rawShift : 0
		const sourceTop = stripIndex * stripPixelHeight
		const destinationTop = -source.height / 2 + stripIndex * stripUnitHeight
		const destinationLeft = -source.width / 2 + shift
		context.drawImage(source.canvas, 0, sourceTop, source.canvas.width, stripPixelHeight, destinationLeft, destinationTop, source.width, stripUnitHeight)
	}
}

const drawGlow = (context: CanvasRenderingContext2D, source: LayerSourceT, pass: LayerPassT, palette: PaletteT, pixelScale: number): void => {
	const amount = pass.fx.glow
	if (amount <= 0) return
	const radius = (6 + 30 * amount) * pixelScale
	const glow = buildSoftCopy(source, palette.accent1, radius, pixelScale)
	context.save()
	context.globalAlpha = pass.alpha * clamp(amount * 1.3, 0, 1)
	drawSoftCopy(context, glow)
	context.restore()
}

const drawSplit = (context: CanvasRenderingContext2D, source: LayerSourceT, pass: LayerPassT, palette: PaletteT): void => {
	const amount = pass.fx.split
	if (amount <= 0) return
	const isDynamic = pass.layer.kind === 'logo'
	const distance = source.width * 0.025 * amount + 2
	const leftCopy = tintSource(source, palette.accent1, isDynamic, 1)
	const rightCopy = tintSource(source, palette.accent2, isDynamic, 2)
	context.save()
	context.globalAlpha = pass.alpha * clamp(0.35 + 0.6 * amount, 0, 1)
	drawCentered(context, leftCopy, source, -distance)
	drawCentered(context, rightCopy, source, distance)
	context.restore()
}

const getFlickerAlpha = (pass: LayerPassT): number => {
	const amount = pass.fx.flicker
	if (amount <= 0) return 1
	const random = createRandom(pass.seed + pass.flickerStep * 104729)
	const isDropped = random() < amount * 0.6
	if (!isDropped) return 1
	return 0.1 + 0.35 * random()
}

type ShakeT = {
	x: number
	y: number
	rotation: number
}

const getShake = (pass: LayerPassT, frame: FrameLayoutT): ShakeT => {
	const amount = pass.fx.shake
	if (amount <= 0) return { x: 0, y: 0, rotation: 0 }
	const random = createRandom(pass.seed + pass.flickerStep * 3571)
	const reach = getShortSide(frame) * 0.03 * amount
	const x = (random() * 2 - 1) * reach
	const y = (random() * 2 - 1) * reach
	const rotation = (random() * 2 - 1) * 2.5 * amount
	return { x, y, rotation }
}

const moveToLayer = (context: CanvasRenderingContext2D, pass: LayerPassT, frame: FrameLayoutT): void => {
	const shake = getShake(pass, frame)
	const centerX = frame.width / 2 + (pass.transform.x / 100) * frame.width + shake.x
	const centerY = frame.height / 2 + (pass.transform.y / 100) * frame.height + shake.y
	const radians = ((pass.transform.rotation + shake.rotation) * Math.PI) / 180
	context.translate(centerX, centerY)
	context.rotate(radians)
	context.scale(pass.transform.scale, pass.transform.scale)
}

// The logo canvas covers the whole frame, so it moves around the
// frame center rather than around its own picture.
const drawPass = (context: CanvasRenderingContext2D, pass: LayerPassT, input: LayerStackInputT): void => {
	const source = getLayerSource(context, pass.layer, input)
	if (source === null) return
	const pixelScale = getPixelScale(context)

	context.save()
	context.globalCompositeOperation = getBlendOperation(pass.layer.blend)
	moveToLayer(context, pass, input.frame)
	const flickeredPass = { ...pass, alpha: pass.alpha * getFlickerAlpha(pass) }
	drawGlow(context, source, flickeredPass, input.palette, pixelScale)
	drawSplit(context, source, flickeredPass, input.palette)

	context.globalAlpha = flickeredPass.alpha
	const blurRadius = 14 * pass.fx.blur * pixelScale
	const hasBlur = blurRadius > 0.5
	const blurredSource = hasBlur ? toBlurredSource(source, blurRadius, pixelScale) : source
	const hasGlitch = pass.fx.glitch > 0
	if (hasGlitch) drawGlitched(context, blurredSource, flickeredPass)
	if (!hasGlitch) drawCentered(context, blurredSource.canvas, blurredSource, 0)
	context.restore()
}


// Bottom to top. The first layer in the list is the back.
export const drawLayerStack = (context: CanvasRenderingContext2D, input: LayerStackInputT): void => {
	for (const layer of input.layers) {
		const pass = buildPass(layer, input)
		if (pass === null) continue
		const isPlainLogo = checkIsPlainLogo(pass)
		if (isPlainLogo) {
			input.drawLogo(context)
			continue
		}
		drawPass(context, pass, input)
	}
}
