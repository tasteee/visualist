export type ModeT = 'light' | 'dark'
export type ResolutionT = '1080' | '720'
export type AspectRatioT = '16:9' | '9:16' | '1:1' | '4:5'
export type FrameRateT = 30 | 60
export type EchoStyleNameT = 'hollow' | 'faintFill' | 'double' | 'sliced' | 'gritty'

export type BuiltInSourceT = 'bass' | 'mids' | 'highs' | 'energy' | 'kick' | 'snare' | 'beat' | 'bar'

// User sources: hit tracks and frequency bands, by id.
export type TrackSourceIdT = `track:${string}`
export type BandSourceIdT = `band:${string}`
export type CustomSourceIdT = TrackSourceIdT | BandSourceIdT

export type ModSourceT = BuiltInSourceT | CustomSourceIdT

// amount runs -1 to 1, as a share of the control's full range.
export type ModulationT = {
	source: ModSourceT
	amount: number
}

export type SignalsT = Record<BuiltInSourceT, number> & Partial<Record<CustomSourceIdT, number>>

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

// length is how long the hit holds, in seconds. Only gate
// tracks use it.
export type HitT = {
	time: number
	strength: number
	length?: number
}

// A hit the user owns. strength runs 0-1, like MIDI velocity.
export type TrackHitT = {
	id: string
	time: number
	strength: number
	length: number
}

// pulse fades out after the hit. gate holds for the hit's
// length, then fades.
export type HitShapeT = 'pulse' | 'gate'

// A track can stand in for the detected kicks or snares, so
// echoes and glitch bursts follow it too.
export type HitRoleT = 'none' | 'kick' | 'snare'

export type HitTrackT = {
	id: string
	name: string
	hits: TrackHitT[]
	decay: number
	shape: HitShapeT
	role: HitRoleT
}

// level is a smooth 0-1 curve. hits turns the band's onsets
// into pulses, like a kick or snare.
export type BandOutputT = 'level' | 'hits'

export type BandSourceT = {
	id: string
	name: string
	lowHz: number
	highHz: number
	output: BandOutputT
	release: number
	sensitivity: number
}

// What computeSignals needs from the user's sources, as plain
// arrays, already sorted and normalized.
export type CompiledTrackT = {
	sourceId: TrackSourceIdT
	name: string
	hits: HitT[]
	decay: number
	shape: HitShapeT
}

export type CompiledBandT = {
	sourceId: BandSourceIdT
	name: string
	series: Float32Array
	hits: HitT[]
	output: BandOutputT
	release: number
}

export type CompiledSourcesT = {
	tracks: CompiledTrackT[]
	bands: CompiledBandT[]
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
	spectrum: SpectrumT
	isDemo: boolean
}

// Band power on the 10 ms grid: frame-major, bandCount values
// per frame. edges has bandCount + 1 frequencies in Hz.
export type SpectrumT = {
	power: Float32Array
	frameCount: number
	bandCount: number
	edges: Float32Array
	averageDb: Float32Array
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
