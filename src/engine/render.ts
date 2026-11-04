import { findFirstHitIndex, getLevels } from './analysis'
import { collectEchoes } from './echoes'
import type { EchoT } from './echoes'
import { getInkPhase, traceInkBlob } from './ink'
import { FRAME_HEIGHT, FRAME_WIDTH, LOGO_CENTER_X, LOGO_CENTER_Y, getTinted } from './logoLayers'
import type { LogoLayersT } from './logoLayers'
import { createRandom } from './rng'
import { FLICKER_RATE, clamp } from './settings'
import type { FrameInputT, ModeT } from './types'

const STRIP_COUNT = 16
const MAX_STRIP_SHIFT = 38
const GLITCH_BURST_SECONDS = 0.18
const BEAT_SPIKE_SECONDS = 0.12
const TITLE_BASELINE_Y = 800
const TITLE_MAX_WIDTH = FRAME_WIDTH * 0.86
const GRAIN_TILE_SIZE = 256

type StripT = {
	top: number
	height: number
	shift: number
}

type FrameStateT = {
	input: FrameInputT
	bass: number
	mid: number
	high: number
	energy: number
	glitch: number
	flickerStep: number
	strips: StripT[]
	echoes: EchoT[]
	introAlpha: number
	titleAlpha: number
	bounceScale: number
	wornVariant: number
}

type ScenePaletteT = {
	background: string
	logo: string
	accent1: string
	accent2: string
}

const getScenePalette = (input: FrameInputT, mode: ModeT): ScenePaletteT => {
	const isLight = mode === 'light'
	return {
		background: isLight ? input.palette.paper : input.palette.ink,
		logo: isLight ? input.palette.ink : input.palette.paper,
		accent1: input.palette.accent1,
		accent2: input.palette.accent2
	}
}

// Audio drivers. With beat bounce on, bass is 40% real audio and
// 60% a spike that lands on every beat of the BPM grid.
const getBeatSpike = (input: FrameInputT): number => {
	const beatLength = 60 / input.bpm
	const sinceBeat = (((input.time - input.beatOffset) % beatLength) + beatLength) % beatLength
	const remaining = Math.max(0, 1 - sinceBeat / BEAT_SPIKE_SECONDS)
	return remaining * remaining
}

const getGlitchAmount = (input: FrameInputT, high: number, energy: number): number => {
	const settings = input.settings
	if (!settings.isGlitchOn) return 0

	const snaps = input.analysis.snaps
	const startIndex = findFirstHitIndex(snaps, input.time - GLITCH_BURST_SECONDS)
	let burst = 0
	for (let snapIndex = startIndex; snapIndex < snaps.length; snapIndex++) {
		const snap = snaps[snapIndex]
		const hasNotHappenedYet = snap.time > input.time
		if (hasNotHappenedYet) break
		const power = snap.strength * settings.reactivity
		const isStrongSnap = power > 0.55
		if (!isStrongSnap) continue
		const fade = 1 - (input.time - snap.time) / GLITCH_BURST_SECONDS
		burst = Math.max(burst, fade * Math.min(1, power))
	}

	const busyness = clamp((energy - 0.4) / 0.4, 0, 1)
	const sustained = 0.3 * high * busyness
	return clamp((burst + sustained) * settings.glitchAmount, 0, 1.5)
}

const buildStrips = (glitch: number, flickerStep: number, top: number, bottom: number): StripT[] => {
	const isGlitching = glitch > 0.15
	if (!isGlitching) return []

	const random = createRandom(flickerStep * 7919 + 3)
	const height = (bottom - top) / STRIP_COUNT
	const strips: StripT[] = []
	for (let index = 0; index < STRIP_COUNT; index++) {
		const isShifted = random() < 0.6
		const rawShift = (random() * 2 - 1) * MAX_STRIP_SHIFT * glitch
		strips.push({ top: top + index * height, height, shift: isShifted ? rawShift : 0 })
	}
	return strips
}

const buildFrameState = (input: FrameInputT, layers: LogoLayersT): FrameStateT => {
	const settings = input.settings
	const reactivity = settings.reactivity
	const levels = getLevels(input.analysis, input.time)
	const audioBass = levels.low * reactivity
	const spike = getBeatSpike(input) * reactivity
	const bass = settings.isBeatBounceOn ? 0.4 * audioBass + 0.6 * spike : audioBass
	const high = levels.high * reactivity
	const mid = levels.mid * reactivity
	const energy = levels.energy * reactivity
	const glitch = getGlitchAmount(input, high, energy)
	const flickerStep = Math.floor(input.time * FLICKER_RATE)

	const wornRandom = createRandom(flickerStep * 104729 + 17)
	const wornChance = clamp((1.1 * high + 0.5 * glitch - 0.25) * settings.textureAmount, 0, 0.9)
	const isWorn = settings.isTextureOn && wornRandom() < wornChance
	const wornVariant = isWorn ? Math.floor(wornRandom() * layers.coreVariants.length) : -1

	const introAlpha = input.isIntroActive ? clamp(input.time / 1, 0, 1) : 1
	const titleAlpha = input.isIntroActive ? clamp((input.time - 0.8) / 0.4, 0, 1) : 1
	const bounceScale = 1 + 0.03 * clamp(bass, 0, 1.4) * settings.bassBounce
	const padding = 12

	return {
		input,
		bass,
		mid,
		high,
		energy,
		glitch,
		flickerStep,
		strips: buildStrips(glitch, flickerStep, layers.bounds.top - padding, layers.bounds.bottom + padding),
		echoes: collectEchoes(input),
		introAlpha,
		titleAlpha,
		bounceScale,
		wornVariant
	}
}

// Draws a mask layer, cut into the shared glitch strips when a
// glitch is on so every layer stays aligned.
const drawLayer = (context: CanvasRenderingContext2D, layer: HTMLCanvasElement, state: FrameStateT, extraShift = 0): void => {
	const hasStrips = state.strips.length > 0
	if (!hasStrips) {
		context.drawImage(layer, extraShift, 0)
		return
	}

	for (const strip of state.strips) {
		const width = layer.width
		context.drawImage(layer, 0, strip.top, width, strip.height, strip.shift + extraShift, strip.top, width, strip.height)
	}
}

const scaleAroundLogo = (context: CanvasRenderingContext2D, scale: number): void => {
	context.translate(LOGO_CENTER_X, LOGO_CENTER_Y)
	context.scale(scale, scale)
	context.translate(-LOGO_CENTER_X, -LOGO_CENTER_Y)
}

const drawBackground = (context: CanvasRenderingContext2D, layers: LogoLayersT, palette: ScenePaletteT, mode: ModeT): void => {
	context.fillStyle = palette.background
	context.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT)
	const textAlpha = mode === 'light' ? 0.06 : 0.08
	context.globalAlpha = textAlpha
	context.drawImage(getTinted(layers.lyricPattern, palette.logo), 0, 0)
	context.globalAlpha = 1
}

const pickEchoColor = (echo: EchoT, palette: ScenePaletteT, slotOffset = 0): string => {
	const slot = (echo.colorSlot + slotOffset) % 3
	if (slot === 0) return palette.accent1
	if (slot === 1) return palette.accent2
	return palette.logo
}

const drawSlicedEcho = (context: CanvasRenderingContext2D, outline: HTMLCanvasElement, echo: EchoT, state: FrameStateT): void => {
	const random = createRandom(echo.seed * 31 + state.flickerStep)
	const maxShift = 18 + 34 * echo.strength
	const stripHeight = outline.height / STRIP_COUNT
	for (let index = 0; index < STRIP_COUNT; index++) {
		const shift = (random() * 2 - 1) * maxShift
		const top = index * stripHeight
		context.drawImage(outline, 0, top, outline.width, stripHeight, shift, top, outline.width, stripHeight)
	}
}

const drawEcho = (context: CanvasRenderingContext2D, echo: EchoT, layers: LogoLayersT, palette: ScenePaletteT, state: FrameStateT): void => {
	const settings = state.input.settings
	const color = pickEchoColor(echo, palette)
	context.save()
	context.globalAlpha = echo.alpha * state.introAlpha
	scaleAroundLogo(context, echo.scale)

	if (echo.style === 'hollow') context.drawImage(getTinted(layers.outline, color), 0, 0)

	if (echo.style === 'faintFill') {
		const fillStrength = clamp(0.06 + 0.2 * echo.strength, 0.06, 0.26)
		const alphaBefore = context.globalAlpha
		const canFill = settings.isSolidOn
		if (canFill) context.globalAlpha = alphaBefore * fillStrength
		if (canFill) context.drawImage(getTinted(layers.silhouette, color), 0, 0)
		context.globalAlpha = alphaBefore
		context.drawImage(getTinted(layers.outline, color), 0, 0)
	}

	if (echo.style === 'double') {
		const spread = 16 * (1 - echo.progress)
		const secondColor = pickEchoColor(echo, palette, 1)
		context.drawImage(getTinted(layers.outline, color), -spread, 0)
		context.drawImage(getTinted(layers.outline, secondColor), spread, 0)
	}

	if (echo.style === 'sliced') drawSlicedEcho(context, getTinted(layers.outline, color), echo, state)

	if (echo.style === 'gritty') {
		const flickerRandom = createRandom(echo.seed * 17 + state.flickerStep)
		const flicker = 0.2 + 0.7 * flickerRandom()
		context.globalAlpha = context.globalAlpha * flicker
		context.drawImage(getTinted(layers.outlineGritty, color), 0, 0)
	}

	context.restore()
}

const grainPatterns = new WeakMap<HTMLCanvasElement, CanvasPattern>()

const getGrainPattern = (context: CanvasRenderingContext2D, tile: HTMLCanvasElement): CanvasPattern | null => {
	const cached = grainPatterns.get(tile)
	if (cached !== undefined) return cached
	const pattern = context.createPattern(tile, 'repeat')
	if (pattern === null) return null
	grainPatterns.set(tile, pattern)
	return pattern
}

const drawGrain = (context: CanvasRenderingContext2D, layers: LogoLayersT, palette: ScenePaletteT, state: FrameStateT): void => {
	const settings = state.input.settings
	if (!settings.isTextureOn) return

	const alpha = Math.min(0.9, (0.3 + 0.55 * state.high) * settings.textureAmount)
	const tinted = getTinted(layers.grainTile, palette.logo)
	const pattern = getGrainPattern(context, tinted)
	if (pattern === null) return

	const random = createRandom(state.flickerStep * 3571 + 5)
	const shiftX = Math.floor(random() * GRAIN_TILE_SIZE)
	const shiftY = Math.floor(random() * GRAIN_TILE_SIZE)
	context.save()
	context.globalAlpha = alpha
	context.translate(shiftX, shiftY)
	context.fillStyle = pattern
	context.fillRect(-shiftX, -shiftY, FRAME_WIDTH, FRAME_HEIGHT)
	context.restore()
}

const drawSolidLayers = (context: CanvasRenderingContext2D, layers: LogoLayersT, palette: ScenePaletteT, state: FrameStateT): void => {
	const settings = state.input.settings
	if (!settings.isSolidOn) return

	const glowAlpha = clamp((0.2 * state.bass + 0.25 * state.energy) * settings.solidAmount, 0, 0.65)
	context.save()
	context.globalAlpha = glowAlpha
	scaleAroundLogo(context, 1.025 + 0.02 * state.bass)
	drawLayer(context, getTinted(layers.silhouette, palette.accent1), state)
	context.restore()

	const splitDistance = (7 * state.bass + 16 * state.glitch) * settings.solidAmount
	const splitAlpha = clamp(splitDistance / 14, 0, 0.8)
	const isSplitVisible = splitDistance > 0.8
	if (!isSplitVisible) return

	context.save()
	context.globalAlpha = splitAlpha
	drawLayer(context, getTinted(layers.silhouette, palette.accent1), state, splitDistance)
	drawLayer(context, getTinted(layers.silhouette, palette.accent2), state, -splitDistance)
	context.restore()
}

const drawTearBars = (context: CanvasRenderingContext2D, layers: LogoLayersT, palette: ScenePaletteT, state: FrameStateT): void => {
	const isTearing = state.glitch > 0.25
	if (!isTearing) return

	const random = createRandom(state.flickerStep * 6007 + 29)
	const barCount = 2 + Math.floor(random() * 5)
	const bounds = layers.bounds
	for (let index = 0; index < barCount; index++) {
		const width = 80 + random() * 420
		const height = 2 + random() * 7
		const x = bounds.left - 60 + random() * (bounds.right - bounds.left + 120 - width)
		const y = bounds.top - 40 + random() * (bounds.bottom - bounds.top + 80)
		context.fillStyle = index % 2 === 0 ? palette.accent1 : palette.accent2
		context.fillRect(x, y, width, height)
	}
}

const drawLogo = (context: CanvasRenderingContext2D, layers: LogoLayersT, palette: ScenePaletteT, state: FrameStateT): void => {
	const settings = state.input.settings
	context.save()
	context.globalAlpha = state.introAlpha
	scaleAroundLogo(context, state.bounceScale)

	const separation = clamp(settings.logoSeparation, 0, 1)
	context.globalAlpha = separation * state.introAlpha
	context.drawImage(getTinted(layers.halo, palette.background), 0, 0)
	context.globalAlpha = state.introAlpha

	drawSolidLayers(context, layers, palette, state)
	drawLayer(context, getTinted(layers.fringeA, palette.accent1), state)
	drawLayer(context, getTinted(layers.fringeB, palette.accent2), state)

	const isWorn = state.wornVariant >= 0
	const coreMask = isWorn ? layers.coreVariants[state.wornVariant] : layers.core
	drawLayer(context, getTinted(coreMask, palette.logo), state)
	drawTearBars(context, layers, palette, state)
	context.restore()
}

const getTitleColor = (state: FrameStateT, palette: ScenePaletteT): string => {
	const titleColor = state.input.settings.titleColor
	if (titleColor === 'accent1') return palette.accent1
	if (titleColor === 'accent2') return palette.accent2
	return palette.logo
}

const drawTitle = (context: CanvasRenderingContext2D, palette: ScenePaletteT, state: FrameStateT): void => {
	const text = state.input.title.trim().toUpperCase()
	const isEmpty = text.length === 0
	if (isEmpty) return

	const settings = state.input.settings
	const setFont = (size: number) => {
		context.font = `900 ${size}px "DM Sans", system-ui, sans-serif`
		context.letterSpacing = `${size * 0.22}px`
	}

	setFont(settings.titleSize)
	const trailingSpace = settings.titleSize * 0.22
	const naturalWidth = context.measureText(text).width - trailingSpace
	const fitScale = Math.min(1, TITLE_MAX_WIDTH / naturalWidth)
	const fittedSize = settings.titleSize * fitScale
	setFont(fittedSize)

	const fittedWidth = naturalWidth * fitScale
	const left = FRAME_WIDTH / 2 - fittedWidth / 2
	context.save()
	context.globalAlpha = state.titleAlpha
	context.textAlign = 'left'
	context.textBaseline = 'middle'

	const isSplit = state.glitch > 0.3
	const splitDistance = 3 + 9 * state.glitch
	if (isSplit) {
		context.fillStyle = palette.accent1
		context.fillText(text, left - splitDistance, TITLE_BASELINE_Y)
		context.fillStyle = palette.accent2
		context.fillText(text, left + splitDistance, TITLE_BASELINE_Y)
	}

	context.fillStyle = getTitleColor(state, palette)
	context.fillText(text, left, TITLE_BASELINE_Y)
	context.restore()
}

// One full frame in one mode, back to front.
const drawScene = (context: CanvasRenderingContext2D, layers: LogoLayersT, state: FrameStateT, mode: ModeT): void => {
	const palette = getScenePalette(state.input, mode)
	drawBackground(context, layers, palette, mode)
	for (const echo of state.echoes) drawEcho(context, echo, layers, palette, state)
	drawGrain(context, layers, palette, state)
	drawLogo(context, layers, palette, state)
	drawTitle(context, palette, state)
}

// Every frame is a pure function of the time and the settings,
// so preview, scrubbing and recording all draw identical frames.
export const drawFrame = (
	context: CanvasRenderingContext2D,
	input: FrameInputT,
	layers: LogoLayersT,
	outputWidth: number,
	outputHeight: number
): void => {
	context.setTransform(outputWidth / FRAME_WIDTH, 0, 0, outputHeight / FRAME_HEIGHT, 0, 0)
	context.globalAlpha = 1
	context.globalCompositeOperation = 'source-over'

	const state = buildFrameState(input, layers)
	const baseMode = input.settings.mode
	const flippedMode: ModeT = baseMode === 'light' ? 'dark' : 'light'
	const inkPhase = getInkPhase(input.time, input.settings, input.inkFinishTime)

	const isFullyFlipped = inkPhase.kind === 'done'
	if (isFullyFlipped) {
		drawScene(context, layers, state, flippedMode)
		return
	}

	drawScene(context, layers, state, baseMode)
	const isSpreading = inkPhase.kind === 'spreading'
	if (!isSpreading) return

	context.save()
	traceInkBlob(context, inkPhase.radius, input.time, state.bass)
	context.clip()
	drawScene(context, layers, state, flippedMode)
	context.restore()
}
