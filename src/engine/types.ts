export type ModeT = 'light' | 'dark'
export type ResolutionT = '1080' | '720'
export type FrameRateT = 30 | 60
export type EchoStyleNameT = 'hollow' | 'faintFill' | 'double' | 'sliced' | 'gritty'

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
	resolution: ResolutionT
	frameRate: FrameRateT
	audioFadeIn: number
	audioFadeOut: number
	videoFadeIn: number
	videoFadeOut: number
}

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
}
