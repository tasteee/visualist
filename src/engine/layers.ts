import { clamp } from './settings'
import type {
	BlendModeT,
	FxKindT,
	LayerFxT,
	LayerKindT,
	LayerParamKeyT,
	LayerT,
	LayerTransformT,
	PaletteSlotT,
	SvgColorT,
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

export const LAYER_PARAMS: LayerParamSpecT[] = [
	{ key: 'x', label: 'Position X', min: -60, max: 60, step: 0.5, suffix: '%' },
	{ key: 'y', label: 'Position Y', min: -60, max: 60, step: 0.5, suffix: '%' },
	{ key: 'scale', label: 'Scale', min: 0.05, max: 3, step: 0.01, suffix: '×' },
	{ key: 'rotation', label: 'Rotation', min: -180, max: 180, step: 1, suffix: '°' },
	{ key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01, suffix: '' }
]

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

export const PALETTE_SLOT_OPTIONS: OptionT<PaletteSlotT>[] = [
	{ value: 'foreground', label: 'Foreground' },
	{ value: 'accent1', label: 'Accent 1' },
	{ value: 'accent2', label: 'Accent 2' },
	{ value: 'background', label: 'Background' }
]

export const SVG_COLOR_OPTIONS: OptionT<SvgColorT>[] = [{ value: 'original', label: 'Original colors' }, ...PALETTE_SLOT_OPTIONS]

export const TEXT_WEIGHT_OPTIONS: OptionT<string>[] = [
	{ value: '400', label: 'Regular' },
	{ value: '700', label: 'Bold' },
	{ value: '900', label: 'Black' }
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

const createIdentityTransform = (): LayerTransformT => ({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 })

const createBaseLayer = (kind: LayerKindT, name: string): LayerT => ({
	id: crypto.randomUUID(),
	kind,
	name,
	isVisible: true,
	transform: createIdentityTransform(),
	modulations: {},
	blend: 'normal',
	startTime: 0,
	endTime: null,
	fx: [],
	text: null,
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
	const content = { text, weight: 900 as TextWeightT, isUppercase: true, color: 'foreground' as PaletteSlotT }
	return { ...layer, transform, text: content }
}

export const createAssetLayer = (kind: 'image' | 'svg', assetId: string, name: string): LayerT => {
	const layer = createBaseLayer(kind, name)
	return { ...layer, assetId }
}

export const createFx = (kind: FxKindT): LayerFxT => {
	const spec = findFxSpec(kind)
	return { id: crypto.randomUUID(), kind, amount: spec.defaultAmount, modulation: null }
}

export const createDefaultLayers = (): LayerT[] => [createLogoLayer()]

// A layer fades in and out over this long at its time edges.
const EDGE_FADE_SECONDS = 0.25

// 0-1 visibility from the layer's time range. A layer that
// starts at zero is fully on from the first frame.
export const getTimeRangeLevel = (layer: LayerT, time: number): number => {
	const endTime = layer.endTime ?? Number.POSITIVE_INFINITY
	const isBeforeStart = time < layer.startTime
	const isAfterEnd = time > endTime
	if (isBeforeStart || isAfterEnd) return 0
	const fadeInLevel = clamp((time - layer.startTime) / EDGE_FADE_SECONDS, 0, 1)
	const fadeOutLevel = clamp((endTime - time) / EDGE_FADE_SECONDS, 0, 1)
	const hasStartAtZero = layer.startTime <= 0
	const startLevel = hasStartAtZero ? 1 : fadeInLevel
	return Math.min(startLevel, fadeOutLevel)
}
