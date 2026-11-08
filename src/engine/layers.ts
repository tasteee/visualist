import { clamp } from './settings'
import type {
	BlendModeT,
	ClipT,
	ClipTransformT,
	FxKindT,
	LayerFxT,
	LayerKindT,
	LayerParamKeyT,
	LayerT,
	LayerTransformT,
	ShapeT,
	TextFontT,
	TextWeightT
} from './types'

export type LayerParamSpecT = {
	key: LayerParamKeyT
	label: string
	min: number
	max: number
	step: number
	suffix: string
}

export type FxSpecT = {
	kind: FxKindT
	label: string
	hint: string
	min: number
	max: number
	step: number
	defaultAmount: number
}

export type OptionT<ValueT extends string> = {
	value: ValueT
	label: string
}

export const LOGO_LAYER_ID = 'logo'

// The color ids saved layers use. They live in the palette.
const WHITE_COLOR_ID = 'white'
const ACCENT_ONE_COLOR_ID = 'accent-1'

export const LAYER_PARAMS: LayerParamSpecT[] = [
	// Position is a percent of the frame from its center: 0 is centered,
	// 100 puts the layer's center one whole frame away.
	{ key: 'x', label: 'Position X', min: -100, max: 100, step: 1, suffix: '%' },
	{ key: 'y', label: 'Position Y', min: -100, max: 100, step: 1, suffix: '%' },
	{ key: 'scale', label: 'Scale', min: 0.05, max: 3, step: 0.1, suffix: '×' },
	{ key: 'rotation', label: 'Rotation', min: -180, max: 180, step: 1, suffix: '°' },
	{ key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01, suffix: '' },
	{ key: 'depth', label: 'Depth', min: 0, max: 100, step: 1, suffix: '%' },
	{ key: 'tilt', label: 'Tilt', min: -80, max: 80, step: 1, suffix: '°' },
	{ key: 'turn', label: 'Turn', min: -80, max: 80, step: 1, suffix: '°' },
	{ key: 'volume', label: 'Volume', min: 0, max: 1.5, step: 0.01, suffix: '' }
]

// Audio layers are heard, not seen, so only volume applies. Every other
// layer is seen, and has no volume.
export const getLayerParams = (kind: LayerKindT): LayerParamSpecT[] => {
	const isAudio = kind === 'audio'
	if (isAudio) return LAYER_PARAMS.filter((spec) => spec.key === 'volume')
	return LAYER_PARAMS.filter((spec) => spec.key !== 'volume')
}

export const FX_SPECS: FxSpecT[] = [
	{ kind: 'glow', label: 'Glow', hint: 'A soft accent halo behind the layer.', min: 0, max: 1, step: 0.01, defaultAmount: 0.5 },
	{ kind: 'split', label: 'Color split', hint: 'Accent copies pulled left and right.', min: 0, max: 1, step: 0.01, defaultAmount: 0.4 },
	{ kind: 'glitch', label: 'Glitch', hint: 'Slices the layer into sliding strips.', min: 0, max: 1, step: 0.01, defaultAmount: 0.4 },
	{ kind: 'shake', label: 'Shake', hint: 'Jitters the position each flicker.', min: 0, max: 1, step: 0.01, defaultAmount: 0.3 },
	{ kind: 'flicker', label: 'Flicker', hint: 'Randomly drops the layer out.', min: 0, max: 1, step: 0.01, defaultAmount: 0.3 },
	{ kind: 'blur', label: 'Blur', hint: 'Softens the layer.', min: 0, max: 1, step: 0.01, defaultAmount: 0.3 }
]

export const BLEND_OPTIONS: OptionT<BlendModeT>[] = [
	{ value: 'normal', label: 'Normal' },
	{ value: 'screen', label: 'Screen' },
	{ value: 'multiply', label: 'Multiply' },
	{ value: 'overlay', label: 'Overlay' },
	{ value: 'softLight', label: 'Soft light' },
	{ value: 'add', label: 'Add' },
	{ value: 'difference', label: 'Difference' }
]

export const TEXT_FONT_OPTIONS: OptionT<TextFontT>[] = [
	{ value: 'google-sans-flex', label: 'Google Sans Flex' },
	{ value: 'dm-sans', label: 'DM Sans' },
	{ value: 'system-ui', label: 'System Sans' },
	{ value: 'serif', label: 'Editorial Serif' },
	{ value: 'monospace', label: 'Monospace' },
	{ value: 'display', label: 'Impact Display' }
]

export const TEXT_WEIGHT_OPTIONS: OptionT<string>[] = [
	{ value: '400', label: 'Regular' },
	{ value: '700', label: 'Bold' },
	{ value: '900', label: 'Black' },
	{ value: '1000', label: 'Extra Black' }
]

const BLEND_OPERATIONS: Record<BlendModeT, GlobalCompositeOperation> = {
	normal: 'source-over',
	screen: 'screen',
	multiply: 'multiply',
	overlay: 'overlay',
	softLight: 'soft-light',
	add: 'lighter',
	difference: 'difference'
}

export const getBlendOperation = (blend: BlendModeT): GlobalCompositeOperation => BLEND_OPERATIONS[blend]

export const findFxSpec = (kind: FxKindT): FxSpecT => {
	const spec = FX_SPECS.find((candidate) => candidate.kind === kind)
	if (spec === undefined) return FX_SPECS[0]
	return spec
}

export const findLayerParam = (key: LayerParamKeyT): LayerParamSpecT => {
	const spec = LAYER_PARAMS.find((candidate) => candidate.key === key)
	if (spec === undefined) return LAYER_PARAMS[0]
	return spec
}

const createIdentityTransform = (): LayerTransformT => ({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, depth: 0, tilt: 0, turn: 0, volume: 1 })

export const createClipTransform = (): ClipTransformT => ({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 })

export const createClip = (clip: Partial<ClipT> = {}): ClipT => ({
	id: crypto.randomUUID(),
	startTime: 0,
	endTime: null,
	sourceOffset: 0,
	fadeIn: 0,
	fadeOut: 0,
	kind: 'text',
	isActive: true,
	name: '',
	color: null,
	text: '',
	textStyle: {},
	...clip,
	transform: { ...createClipTransform(), ...clip.transform }
})

const createBaseLayer = (kind: LayerKindT, name: string): LayerT => ({
	id: crypto.randomUUID(),
	kind,
	name,
	isVisible: true,
	transform: createIdentityTransform(),
	modulations: {},
	blend: 'normal',
	clips: [createClip({ kind })],
	fx: [],
	text: null,
	shape: null,
	assetId: null,
	svgColor: 'original'
})

export const createLogoLayer = (): LayerT => {
	const layer = createBaseLayer('logo', 'Logo')
	return { ...layer, id: LOGO_LAYER_ID }
}

export const createTextLayer = (text: string): LayerT => {
	const layer = createBaseLayer('text', 'Text')
	const transform = { ...layer.transform, y: 30 }
	const content = {
		font: 'dm-sans' as TextFontT,
		weight: '900' as TextWeightT,
		isUppercase: true,
		isLowercase: false,
		isItalic: false,
		isUnderline: false,
		isStrike: false,
		color: WHITE_COLOR_ID
	}
	const clips = [createClip({ text })]
	return { ...layer, transform, text: content, clips }
}

// A shape starts as a white square.
export const createShapeLayer = (): LayerT => {
	const layer = createBaseLayer('shape', 'Shape')
	const shape: ShapeT = { kind: 'square', fill: 'solid', color: WHITE_COLOR_ID, color2: ACCENT_ONE_COLOR_ID, angle: 90 }
	return { ...layer, shape }
}

export const createAssetLayer = (kind: 'image' | 'svg', assetId: string | null, name: string): LayerT => {
	const layer = createBaseLayer(kind, name)
	return { ...layer, assetId }
}

export const createVideoLayer = (assetId: string, name: string): LayerT => {
	const layer = createBaseLayer('video', name)
	return { ...layer, assetId }
}

export const createAudioLayer = (assetId: string, name: string): LayerT => {
	const layer = createBaseLayer('audio', name)
	return { ...layer, assetId }
}

export const createFx = (kind: FxKindT): LayerFxT => {
	const spec = findFxSpec(kind)
	return { id: crypto.randomUUID(), kind, amount: spec.defaultAmount, modulation: null }
}

// A new project has no layers at all.
export const createDefaultLayers = (): LayerT[] => []

// How long a clip fades in and out at its edges. Zero is a hard cut.
// Clips will get their own value later.
const EDGE_FADE_SECONDS = 0

// 0-1 visibility from the layer's time range. A layer that
// starts at zero is fully on from the first frame.
// Visibility from 0 to 1 across the clip's time range.
// A clip that starts at zero is fully visible from the first frame.
export const getClipLevel = (
	clip: ClipT,
	time: number,
	songLength = Number.POSITIVE_INFINITY
): number => {
	if (!clip.isActive) return 0

	const endTime = clip.endTime ?? songLength
	const isBeforeStart = time < clip.startTime
	const isAfterEnd = time > endTime
	if (isBeforeStart || isAfterEnd) return 0

	const fadeIn = Math.max(0, clip.fadeIn ?? 0)
	const fadeOut = Math.max(0, clip.fadeOut ?? 0)
	const hasExplicitFade = fadeIn > 0 || fadeOut > 0
	const startsAtZero = clip.startTime <= 0

	if (hasExplicitFade) {
		const canFadeIn = fadeIn > 0 && !startsAtZero
		const canFadeOut = fadeOut > 0 && Number.isFinite(endTime)

		const incomingLevel = canFadeIn
			? clamp((time - clip.startTime) / fadeIn, 0, 1)
			: 1
		const outgoingLevel = canFadeOut
			? clamp((endTime - time) / fadeOut, 0, 1)
			: 1

		return Math.min(incomingLevel, outgoingLevel)
	}

	const hasEdgeFade = EDGE_FADE_SECONDS > 0
	if (!hasEdgeFade) return 1

	const incomingLevel = startsAtZero
		? 1
		: clamp((time - clip.startTime) / EDGE_FADE_SECONDS, 0, 1)
	const outgoingLevel = clamp((endTime - time) / EDGE_FADE_SECONDS, 0, 1)

	return Math.min(incomingLevel, outgoingLevel)
}

// The layer shows through whichever of its clips is on right now.
export const getTimeRangeLevel = (layer: LayerT, time: number, songLength = Number.POSITIVE_INFINITY): number => {
	let level = 0
	for (const clip of layer.clips) level = Math.max(level, getClipLevel(clip, time, songLength))
	return level
}

// What a text layer says at this moment: its active clip's words, or
// the first clip's when none is showing.
export const getClipTextAt = (layer: LayerT, time: number): string => {
	const clip = findClipAt(layer, time) ?? layer.clips[0]
	return clip?.text ?? ''
}

// The layer as it looks at this moment: the clip showing now adds its
// own transform and text style on top of the layer's.
export const applyClipToLayer = (layer: LayerT, time: number): LayerT => {
	const clip = findClipAt(layer, time)
	if (clip === undefined) return layer
	const { x, y, scale, rotation, opacity } = clip.transform
	const hasTransform = x !== 0 || y !== 0 || scale !== 1 || rotation !== 0 || opacity !== 1
	const hasStyle = layer.text !== null && Object.keys(clip.textStyle).length > 0
	if (!hasTransform && !hasStyle) return layer
	const base = layer.transform
	const transform = { ...base, x: base.x + x, y: base.y + y, scale: base.scale * scale, rotation: base.rotation + rotation, opacity: base.opacity * opacity }
	const text = hasStyle && layer.text !== null ? { ...layer.text, ...clip.textStyle } : layer.text
	return { ...layer, transform, text }
}

// The active clip that covers this moment, if any.
export const findClipAt = (layer: LayerT, time: number): ClipT | undefined => {
	return layer.clips.find((clip) => clip.isActive && time >= clip.startTime && time <= (clip.endTime ?? Number.POSITIVE_INFINITY))
}


export type ClipBoundsT = {
	minStart: number
	maxEnd: number
}

// Hard-clamping bounds from a clip's immediate left and right neighbors
// on the same layer, so clips never overlap.
export const getClipNeighborBounds = (clips: ClipT[], clipId: string, getClipEndTime: (clip: ClipT) => number, maxTimelineEnd: number): ClipBoundsT => {
	const current = clips.find((candidate) => candidate.id === clipId)
	if (current === undefined) return { minStart: 0, maxEnd: maxTimelineEnd }
	let minStart = 0
	let maxEnd = maxTimelineEnd
	const currentEnd = getClipEndTime(current)
	for (const neighbor of clips) {
		if (neighbor.id === clipId) continue
		const neighborEnd = getClipEndTime(neighbor)
		const isLeftNeighbor = neighborEnd <= current.startTime + 1e-6 || (neighbor.startTime < current.startTime && neighborEnd < currentEnd)
		if (isLeftNeighbor) minStart = Math.max(minStart, neighborEnd)
		const isRightNeighbor = neighbor.startTime >= currentEnd - 1e-6 || neighbor.startTime > current.startTime
		if (isRightNeighbor) maxEnd = Math.min(maxEnd, neighbor.startTime)
	}
	return { minStart, maxEnd }
}
