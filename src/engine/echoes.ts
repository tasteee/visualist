import { findFirstHitIndex, getLevels } from './analysis'
import { clamp } from './settings'
import type { EchoStyleNameT, FrameInputT, SettingsT } from './types'

export type EchoColorSlotT = 0 | 1 | 2

export type EchoT = {
	style: EchoStyleNameT
	progress: number
	strength: number
	alpha: number
	scale: number
	colorSlot: EchoColorSlotT
	seed: number
}

const KICK_ECHO_LIFE = 0.8
const KICK_GRID_TOLERANCE = 0.07
const MIN_KICK_POWER = 0.6

// A style the user switched off is replaced by another enabled
// one. Sliced needs Glitch on and gritty needs Texture on.
const getEnabledStyles = (settings: SettingsT): EchoStyleNameT[] => {
	const names: EchoStyleNameT[] = ['hollow', 'faintFill', 'double', 'sliced', 'gritty']
	const enabled: EchoStyleNameT[] = []
	for (const name of names) {
		const isSwitchedOn = settings.echoStyles[name]
		const isBlockedByGlitch = name === 'sliced' && !settings.isGlitchOn
		const isBlockedByTexture = name === 'gritty' && !settings.isTextureOn
		const isAvailable = isSwitchedOn && !isBlockedByGlitch && !isBlockedByTexture
		if (isAvailable) enabled.push(name)
	}
	return enabled
}

const positiveModulo = (value: number, divisor: number): number => {
	return ((value % divisor) + divisor) % divisor
}

const pickAvailableStyle = (wanted: EchoStyleNameT, enabled: EchoStyleNameT[], spawnIndex: number): EchoStyleNameT => {
	const isWantedEnabled = enabled.includes(wanted)
	if (isWantedEnabled) return wanted
	return enabled[positiveModulo(spawnIndex, enabled.length)]
}

type SpawnAudioT = {
	bass: number
	mid: number
	high: number
	energy: number
}

const readSpawnAudio = (input: FrameInputT, spawnTime: number): SpawnAudioT => {
	const reactivity = input.settings.reactivity
	const levels = getLevels(input.analysis, spawnTime)
	return {
		bass: levels.low * reactivity,
		mid: levels.mid * reactivity,
		high: levels.high * reactivity,
		energy: levels.energy * reactivity
	}
}

const getSpawnStrength = (audio: SpawnAudioT): number => {
	return clamp(0.25 + 0.6 * audio.bass + 0.35 * audio.energy, 0.1, 1.3)
}

// The music picks the style at the moment the echo is born.
const chooseGridStyle = (audio: SpawnAudioT, isOffBeat: boolean): EchoStyleNameT => {
	if (isOffBeat) return 'gritty'
	if (audio.energy < 0.2) return 'hollow'
	const isBassLoudest = audio.bass > audio.mid && audio.bass > audio.high
	if (isBassLoudest) return 'faintFill'
	if (audio.high > audio.mid) return 'sliced'
	return 'double'
}

const shapeEcho = (
	settings: SettingsT,
	style: EchoStyleNameT,
	strength: number,
	age: number,
	life: number,
	colorSlot: EchoColorSlotT,
	seed: number
): EchoT => {
	const progress = clamp(age / life, 0, 1)
	const remaining = 1 - progress
	const easedProgress = 1 - remaining * remaining * remaining
	const growth = (0.05 + 0.3 * strength) * settings.echoSize
	const fade = remaining * remaining * remaining
	const brightness = Math.min(1, strength + 0.15)
	const alpha = clamp(fade * settings.echoAmount * brightness, 0, 1)
	return { style, progress, strength, alpha, scale: 1 + growth * easedProgress, colorSlot, seed }
}

const collectGridEchoes = (input: FrameInputT, enabled: EchoStyleNameT[]): EchoT[] => {
	const settings = input.settings
	const beatLength = 60 / input.bpm
	const halfBeat = beatLength / 2
	const life = clamp(2 * beatLength, 0.5, 1.8) / settings.echoSpeed
	const firstIndex = Math.ceil((input.time - life - input.beatOffset) / halfBeat)
	const lastIndex = Math.floor((input.time - input.beatOffset) / halfBeat)
	const echoes: EchoT[] = []

	for (let spawnIndex = Math.max(0, firstIndex); spawnIndex <= lastIndex; spawnIndex++) {
		const spawnTime = input.beatOffset + spawnIndex * halfBeat
		const age = input.time - spawnTime
		const isAlive = age >= 0 && age <= life
		if (!isAlive) continue

		const audio = readSpawnAudio(input, spawnTime)
		const isOffBeat = spawnIndex % 2 === 1
		const isTooQuiet = isOffBeat && audio.energy <= 0.5
		if (isTooQuiet) continue

		const baseStrength = getSpawnStrength(audio)
		const offBeatFactor = isOffBeat ? 0.6 : 1
		const isDownbeat = spawnIndex % 8 === 0
		const downbeatFactor = isDownbeat ? 1.2 : 1
		const strength = baseStrength * offBeatFactor * downbeatFactor

		const wantedStyle = chooseGridStyle(audio, isOffBeat)
		const style = pickAvailableStyle(wantedStyle, enabled, spawnIndex)
		const colorSlot = positiveModulo(spawnIndex, 3) as EchoColorSlotT
		echoes.push(shapeEcho(settings, style, strength, age, life, colorSlot, spawnIndex * 131 + 7))
	}

	return echoes
}

// A real kick that lands away from the grid adds its own echo.
const collectKickEchoes = (input: FrameInputT, enabled: EchoStyleNameT[]): EchoT[] => {
	const settings = input.settings
	const halfBeat = 30 / input.bpm
	const life = KICK_ECHO_LIFE / settings.echoSpeed
	const kicks = input.analysis.kicks
	const startIndex = findFirstHitIndex(kicks, input.time - life)
	const echoes: EchoT[] = []

	for (let kickIndex = startIndex; kickIndex < kicks.length; kickIndex++) {
		const kick = kicks[kickIndex]
		const hasNotHappenedYet = kick.time > input.time
		if (hasNotHappenedYet) break

		const isStrongEnough = kick.strength * settings.reactivity > MIN_KICK_POWER
		if (!isStrongEnough) continue

		const nearestGridIndex = Math.round((kick.time - input.beatOffset) / halfBeat)
		const nearestGridTime = input.beatOffset + nearestGridIndex * halfBeat
		const isOnGrid = Math.abs(kick.time - nearestGridTime) <= KICK_GRID_TOLERANCE
		if (isOnGrid) continue

		const audio = readSpawnAudio(input, kick.time)
		const strength = getSpawnStrength(audio)
		const style = pickAvailableStyle('faintFill', enabled, kickIndex)
		const colorSlot = positiveModulo(kickIndex, 3) as EchoColorSlotT
		const age = input.time - kick.time
		echoes.push(shapeEcho(settings, style, strength, age, life, colorSlot, kickIndex * 197 + 11))
	}

	return echoes
}

// Only echoes inside their life window exist, so per-frame cost
// stays bounded. Oldest first, so the newest draws on top.
export const collectEchoes = (input: FrameInputT): EchoT[] => {
	const settings = input.settings
	if (!settings.isEchoesOn) return []

	const enabled = getEnabledStyles(settings)
	const hasNoStyles = enabled.length === 0
	if (hasNoStyles) return []

	const gridEchoes = collectGridEchoes(input, enabled)
	const kickEchoes = collectKickEchoes(input, enabled)
	const allEchoes = [...gridEchoes, ...kickEchoes]
	return allEchoes.sort((first, second) => second.progress - first.progress)
}
