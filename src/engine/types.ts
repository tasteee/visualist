export type ModeT = 'light' | 'dark'
export type ResolutionT = '1080' | '720'
export type AspectRatioT = '16:9' | '9:16' | '1:1' | '4:5'
export type FrameRateT = 30 | 60
export type EchoStyleNameT = 'hollow' | 'faintFill' | 'double' | 'sliced' | 'gritty'

export type ModSourceT = 'bass' | 'mids' | 'highs' | 'energy' | 'kick' | 'snare' | 'beat' | 'bar'

// amount runs -1 to 1, as a share of the control's full range.
export type ModulationT = {
	source: ModSourceT
	amount: number
}

export type SignalsT = Record<ModSourceT, number>

export type FadeSettingNameT = 'audioFadeIn' | 'audioFadeOut' | 'videoFadeIn' | 'videoFadeOut'

export type EchoStylesT = Record<EchoStyleNameT, boolean>

export type SettingsT = {
	mode: ModeT
	logoBorder: number
	accent1: string
	accent2: string
	background: string
	foreground: string
	reactivity: number
	echoAmount: number
	echoSize: number
	echoSpeed: number
	glitchAmount: number
	textureAmount: number
	solidAmount: number
	echoStyles: EchoStylesT
	aspectRatio: AspectRatioT
	resolution: ResolutionT
	frameRate: FrameRateT
	audioFadeIn: number
	audioFadeOut: number
	videoFadeIn: number
	videoFadeOut: number
	bloomAmount: number
	aberrationAmount: number
	warpAmount: number
	scanlineAmount: number
	noiseAmount: number
	vignetteAmount: number
	modulations: SettingModulationsT
}

export type SettingModulationsT = Partial<Record<AutomatableKeyT, ModulationT>>

export type HitT = {
	time: number
	strength: number
}

// All series sit on a 10 ms grid: index = floor(time * 100).
export type AnalysisT = {
	duration: number
	low: Float32Array
	mid: Float32Array
	high: Float32Array
	level: Float32Array
	energy: Float32Array
	flux: Float32Array
	kicks: HitT[]
	snaps: HitT[]
	bpm: number
	beatOffset: number
	isDemo: boolean
}

export type AudioLevelsT = {
	low: number
	mid: number
	high: number
	energy: number
}

export type PaletteT = {
	accent1: string
	accent2: string
	background: string
	foreground: string
}

export type FrameInputT = {
	time: number
	analysis: AnalysisT
	settings: SettingsT
	palette: PaletteT
	bpm: number
	beatOffset: number
	title: string
	isIntroActive: boolean
	layers: LayerT[]
	signals: SignalsT
}

export type AutomatableKeyT =
	| 'logoBorder'
	| 'reactivity'
	| 'echoAmount'
	| 'echoSize'
	| 'echoSpeed'
	| 'glitchAmount'
	| 'textureAmount'
	| 'solidAmount'
	| 'bloomAmount'
	| 'aberrationAmount'
	| 'warpAmount'
	| 'scanlineAmount'
	| 'noiseAmount'
	| 'vignetteAmount'

export type AutomationControlT = {
	key: AutomatableKeyT
	label: string
	min: number
	max: number
	step: number
}

// value is normalized 0-1 across the control's range. bend
// shapes the segment that runs from this point to the next.
export type AutomationPointT = {
	id: string
	time: number
	value: number
	bend: number
}

// What a lane drives: a global setting, a layer's transform
// param, or the amount of one effect on a layer.
export type LaneTargetT =
	| { kind: 'setting'; key: AutomatableKeyT }
	| { kind: 'layer'; layerId: string; param: LayerParamKeyT }
	| { kind: 'fx'; layerId: string; fxId: string }

// The range a lane's 0-1 points map onto.
export type LaneControlT = {
	label: string
	min: number
	max: number
	step: number
}

export type AutomationLaneT = {
	id: string
	target: LaneTargetT
	points: AutomationPointT[]
}

export type LayerKindT = 'logo' | 'text' | 'image' | 'svg'

export type BlendModeT = 'normal' | 'screen' | 'multiply' | 'overlay' | 'softLight' | 'add' | 'difference'

export type PaletteSlotT = 'foreground' | 'accent1' | 'accent2' | 'background'

// SVG layers can keep their own colors or take one from the palette.
export type SvgColorT = 'original' | PaletteSlotT

export type TextWeightT = 400 | 700 | 900

// x and y are percent of the frame from its center. scale 1 is
// the layer's natural size. rotation is in degrees.
export type LayerTransformT = {
	x: number
	y: number
	scale: number
	rotation: number
	opacity: number
}

export type LayerParamKeyT = keyof LayerTransformT

export type FxKindT = 'glow' | 'split' | 'glitch' | 'shake' | 'flicker' | 'blur'

export type LayerFxT = {
	id: string
	kind: FxKindT
	amount: number
	modulation: ModulationT | null
}

export type TextContentT = {
	text: string
	weight: TextWeightT
	isUppercase: boolean
	color: PaletteSlotT
}

// endTime null means the layer runs to the end of the song.
export type LayerT = {
	id: string
	kind: LayerKindT
	name: string
	isVisible: boolean
	transform: LayerTransformT
	modulations: Partial<Record<LayerParamKeyT, ModulationT>>
	blend: BlendModeT
	startTime: number
	endTime: number | null
	fx: LayerFxT[]
	text: TextContentT | null
	assetId: string | null
	svgColor: SvgColorT
}
