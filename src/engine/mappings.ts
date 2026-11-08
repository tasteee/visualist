import { findFirstImpulseIndex } from './analysis'
import { AUTOMATION_CONTROLS, evaluatePoints, findControl } from './automation'
import { FX_SPECS, LAYER_PARAMS, findClipAt, findFxSpec, findLayerParam, getLayerParams } from './layers'
import { clamp } from './settings'
import type {
	AdEnvelopeT,
	AutomationLaneT,
	ClipParamKeyT,
	ClipT,
	ClipTransformT,
	ImpulseT,
	ImpulseTrackT,
	LayerT,
	MappingT,
	MappingTargetT,
	ModulatorRefT,
	SettingsT
} from './types'

export const MIN_ATTACK_MS = 0
export const MAX_ATTACK_MS = 2000
export const DEFAULT_ATTACK_MS = 10

export const MIN_DECAY_MS = 10
export const MAX_DECAY_MS = 5000
export const DEFAULT_DECAY_MS = 250

export const MIN_ENVELOPE_CURVE = -100
export const MAX_ENVELOPE_CURVE = 100
export const DEFAULT_ATTACK_CURVE = 0
export const DEFAULT_DECAY_CURVE = -35

export const DEFAULT_INFLUENCE = 0.5
const MAX_OVERLAPPING_EMISSIONS = 24
const CURVE_EXPONENT_SCALE = 2.2

export type ClipParamSpecT = {
	key: ClipParamKeyT
	label: string
	min: number
	max: number
	step: number
	suffix: string
}

export const CLIP_PARAMS: ClipParamSpecT[] = [
	{ key: 'x', label: 'Position X', min: -100, max: 100, step: 1, suffix: '%' },
	{ key: 'y', label: 'Position Y', min: -100, max: 100, step: 1, suffix: '%' },
	{ key: 'scale', label: 'Scale', min: 0.05, max: 3, step: 0.05, suffix: '×' },
	{ key: 'rotation', label: 'Rotation', min: -180, max: 180, step: 1, suffix: '°' },
	{ key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01, suffix: '' }
]

export const findClipParam = (key: ClipParamKeyT): ClipParamSpecT => {
	const spec = CLIP_PARAMS.find((candidate) => candidate.key === key)
	if (spec === undefined) return CLIP_PARAMS[0]
	return spec
}

export const createDefaultEnvelope = (): AdEnvelopeT => ({
	attackMs: DEFAULT_ATTACK_MS,
	attackCurve: DEFAULT_ATTACK_CURVE,
	decayMs: DEFAULT_DECAY_MS,
	decayCurve: DEFAULT_DECAY_CURVE
})

// Power-curve shaping for normalized 0..1 progress.
// curve in [-100, +100]: 0 is linear, negative is punchy/fast-initial, positive is slow-initial.
export const shapeEnvelopeProgress = (progress: number, curve: number): number => {
	const clampedProgress = clamp(progress, 0, 1)
	if (clampedProgress <= 0) return 0
	if (clampedProgress >= 1) return 1
	const normalizedCurve = clamp(curve, MIN_ENVELOPE_CURVE, MAX_ENVELOPE_CURVE) / 100
	if (normalizedCurve === 0) return clampedProgress
	const exponent = Math.exp(normalizedCurve * CURVE_EXPONENT_SCALE)
	return Math.pow(clampedProgress, exponent)
}

// Evaluates a single one-shot AD emission at `ageSeconds` after its trigger.
// Attack rises 0 -> 1 over attackMs; Decay falls 1 -> 0 strictly by attackMs + decayMs.
export const evaluateSingleAd = (ageSeconds: number, envelope: AdEnvelopeT): number => {
	if (ageSeconds < 0) return 0
	const attackSeconds = Math.max(0, envelope.attackMs) / 1000
	const decaySeconds = Math.max(MIN_DECAY_MS, envelope.decayMs) / 1000
	const totalSeconds = attackSeconds + decaySeconds
	if (ageSeconds >= totalSeconds) return 0
	if (attackSeconds > 0 && ageSeconds < attackSeconds) {
		const attackProgress = ageSeconds / attackSeconds
		return shapeEnvelopeProgress(attackProgress, envelope.attackCurve)
	}
	const decayElapsed = ageSeconds - attackSeconds
	const decayProgress = clamp(decayElapsed / decaySeconds, 0, 1)
	// Decay goes from 1 down to 0. Negative curve bows downward (punchy exponential decay).
	return shapeEnvelopeProgress(1 - decayProgress, -envelope.decayCurve)
}

// Evaluates all overlapping emissions on an emitter track for a given mapping's AD envelope.
// Rapid overlapping emissions sum together and clamp to 1.0 (100% modulator output).
export const evaluateEmitterSignal = (impulses: ImpulseT[], time: number, envelope: AdEnvelopeT): number => {
	if (impulses.length === 0) return 0
	const lookbackSeconds = (Math.max(0, envelope.attackMs) + Math.max(MIN_DECAY_MS, envelope.decayMs)) / 1000
	const startIndex = findFirstImpulseIndex(impulses, time - lookbackSeconds)
	const recent = impulses.slice(startIndex, startIndex + MAX_OVERLAPPING_EMISSIONS)
	let sum = 0
	for (const impulse of recent) {
		if (impulse.time > time) break
		const age = time - impulse.time
		const gain = evaluateSingleAd(age, envelope)
		sum += clamp(impulse.strength, 0, 1) * gain
	}
	return clamp(sum, 0, 1)
}

// Resolves the evaluation time for a mapping.
// - 'song' mode: evaluates at global playhead time.
// - 'clip' mode: anchors 0:00 of the modulator to the clip's un-trimmed origin
//   (clip.startTime - clip.sourceOffset), so dragging the clip moves the modulation
//   with it, and slicing or trimming the clip preserves exact phase alignment.
export const resolveMappingEvalTime = (mapping: MappingT, activeClip: ClipT | undefined, time: number): number => {
	if (mapping.timeMode !== 'clip' || activeClip === undefined) return time
	const clipOrigin = activeClip.startTime - activeClip.sourceOffset
	return Math.max(0, time - clipOrigin)
}

export type ModulatorContextT = {
	tracks: ImpulseTrackT[]
	lanes: AutomationLaneT[]
}

export const evaluateMappingSignal = (mapping: MappingT, context: ModulatorContextT, evalTime: number): number => {
	if (mapping.isBypassed) return 0
	const modulator = mapping.modulator
	if (modulator.kind === 'emitter') {
		const track = context.tracks.find((candidate) => candidate.id === modulator.trackId)
		if (track === undefined) return 0
		return evaluateEmitterSignal(track.impulses, evalTime, mapping.envelope)
	}
	const lane = context.lanes.find((candidate) => candidate.id === modulator.laneId)
	if (lane === undefined || lane.isBypassed === true) return 0
	return evaluatePoints(lane.points, evalTime, 0)
}

export type TargetRangeSpecT = {
	label: string
	min: number
	max: number
	step: number
	suffix: string
}

export const getMappingTargetSpec = (target: MappingTargetT, layers: LayerT[]): TargetRangeSpecT | null => {
	if (target.kind === 'setting') {
		const control = findControl(target.key)
		if (control === null) return null
		return { label: control.label, min: control.min, max: control.max, step: control.step, suffix: '' }
	}
	const layer = layers.find((candidate) => candidate.id === target.layerId)
	if (layer === undefined) return null
	if (target.kind === 'layer') return findLayerParam(target.param)
	if (target.kind === 'clip') {
		const hasClip = layer.clips.some((clip) => clip.id === target.clipId)
		if (!hasClip) return null
		return findClipParam(target.param)
	}
	const fx = layer.fx.find((candidate) => candidate.id === target.fxId)
	if (fx === undefined) return null
	const spec = findFxSpec(fx.kind)
	return { label: spec.label, min: spec.min, max: spec.max, step: spec.step, suffix: '' }
}

export const checkIsSameMappingTarget = (first: MappingTargetT, second: MappingTargetT): boolean => {
	if (first.kind === 'setting' && second.kind === 'setting') return first.key === second.key
	if (first.kind === 'layer' && second.kind === 'layer') return first.layerId === second.layerId && first.param === second.param
	if (first.kind === 'clip' && second.kind === 'clip') return first.clipId === second.clipId && first.param === second.param
	if (first.kind === 'fx' && second.kind === 'fx') return first.layerId === second.layerId && first.fxId === second.fxId
	return false
}

export const checkIsSameModulator = (first: ModulatorRefT, second: ModulatorRefT): boolean => {
	if (first.kind === 'emitter' && second.kind === 'emitter') return first.trackId === second.trackId
	if (first.kind === 'lane' && second.kind === 'lane') return first.laneId === second.laneId
	return false
}

export const getMappingTargetKey = (target: MappingTargetT): string => {
	if (target.kind === 'setting') return `setting:${target.key}`
	if (target.kind === 'layer') return `layer:${target.layerId}:${target.param}`
	if (target.kind === 'clip') return `clip:${target.layerId}:${target.clipId}:${target.param}`
	return `fx:${target.layerId}:${target.fxId}`
}

export type TargetOptionT = {
	value: string
	label: string
	target: MappingTargetT
}

export const listAllMappingTargets = (layers: LayerT[]): TargetOptionT[] => {
	const options: TargetOptionT[] = []
	for (const layer of layers) {
		for (const param of getLayerParams(layer.kind)) {
			const target: MappingTargetT = { kind: 'layer', layerId: layer.id, param: param.key }
			options.push({ value: getMappingTargetKey(target), label: `${layer.name} · ${param.label}`, target })
		}
		if (layer.kind !== 'audio') {
			for (const fx of layer.fx) {
				const spec = findFxSpec(fx.kind)
				const target: MappingTargetT = { kind: 'fx', layerId: layer.id, fxId: fx.id }
				options.push({ value: getMappingTargetKey(target), label: `${layer.name} · FX ${spec.label}`, target })
			}
			for (const [clipIndex, clip] of layer.clips.entries()) {
				const clipTitle = clip.name.trim() || (layer.kind === 'text' && clip.text.trim() ? clip.text.trim().slice(0, 18) : `Clip ${clipIndex + 1}`)
				for (const param of CLIP_PARAMS) {
					const target: MappingTargetT = { kind: 'clip', layerId: layer.id, clipId: clip.id, param: param.key }
					options.push({ value: getMappingTargetKey(target), label: `${layer.name} (${clipTitle}) · ${param.label}`, target })
				}
			}
		}
	}
	for (const control of AUTOMATION_CONTROLS) {
		const target: MappingTargetT = { kind: 'setting', key: control.key }
		options.push({ value: getMappingTargetKey(target), label: `Stage · ${control.label}`, target })
	}
	return options
}

// Evaluates V_final(t) = clamp(V_base + sum(S_i(t) * Influence_i * span), min, max)
export const evaluateMappedValue = (
	baseValue: number,
	min: number,
	max: number,
	target: MappingTargetT,
	mappings: MappingT[],
	context: ModulatorContextT,
	activeClip: ClipT | undefined,
	time: number
): number => {
	const span = max - min
	let delta = 0
	for (const mapping of mappings) {
		if (mapping.isBypassed) continue
		if (!checkIsSameMappingTarget(mapping.target, target)) continue
		const evalTime = resolveMappingEvalTime(mapping, activeClip, time)
		const signal = evaluateMappingSignal(mapping, context, evalTime)
		delta += signal * mapping.influence * span
	}
	return clamp(baseValue + delta, min, max)
}

export const applyMappingsToSettings = (settings: SettingsT, mappings: MappingT[], context: ModulatorContextT, time: number): SettingsT => {
	const settingMappings = mappings.filter((mapping) => !mapping.isBypassed && mapping.target.kind === 'setting')
	if (settingMappings.length === 0) return settings
	const live: SettingsT = { ...settings }
	for (const control of AUTOMATION_CONTROLS) {
		const target: MappingTargetT = { kind: 'setting', key: control.key }
		const hasMapping = settingMappings.some((mapping) => checkIsSameMappingTarget(mapping.target, target))
		if (!hasMapping) continue
		live[control.key] = evaluateMappedValue(live[control.key], control.min, control.max, target, settingMappings, context, undefined, time)
	}
	return live
}

const resolveMappedClipTransform = (layer: LayerT, clip: ClipT, mappings: MappingT[], context: ModulatorContextT, time: number): ClipTransformT => {
	const resolved: ClipTransformT = { ...clip.transform }
	for (const spec of CLIP_PARAMS) {
		const target: MappingTargetT = { kind: 'clip', layerId: layer.id, clipId: clip.id, param: spec.key }
		resolved[spec.key] = evaluateMappedValue(resolved[spec.key], spec.min, spec.max, target, mappings, context, clip, time)
	}
	return resolved
}

export const applyMappingsToLayers = (layers: LayerT[], mappings: MappingT[], context: ModulatorContextT, time: number): LayerT[] => {
	const activeMappings = mappings.filter((mapping) => !mapping.isBypassed && mapping.target.kind !== 'setting')
	return layers.map((layer) => {
		const activeClip = findClipAt(layer, time)
		const layerMappings = activeMappings.filter((mapping) => mapping.target.kind !== 'setting' && mapping.target.layerId === layer.id)
		let transform = { ...layer.transform }
		if (layerMappings.length > 0) {
			for (const spec of LAYER_PARAMS) {
				const target: MappingTargetT = { kind: 'layer', layerId: layer.id, param: spec.key }
				transform[spec.key] = evaluateMappedValue(transform[spec.key], spec.min, spec.max, target, layerMappings, context, activeClip, time)
			}
		}
		const fx = layer.fx.map((effect) => {
			const spec = FX_SPECS.find((candidate) => candidate.kind === effect.kind) ?? FX_SPECS[0]
			const target: MappingTargetT = { kind: 'fx', layerId: layer.id, fxId: effect.id }
			const amount = evaluateMappedValue(effect.amount, spec.min, spec.max, target, layerMappings, context, activeClip, time)
			return { ...effect, amount }
		})
		if (activeClip === undefined) return { ...layer, transform, fx }
		const clipTransform = resolveMappedClipTransform(layer, activeClip, layerMappings, context, time)
		const combinedTransform = {
			...transform,
			x: clamp(transform.x + clipTransform.x, -100, 100),
			y: clamp(transform.y + clipTransform.y, -100, 100),
			scale: clamp(transform.scale * clipTransform.scale, 0.05, 3),
			rotation: clamp(transform.rotation + clipTransform.rotation, -180, 180),
			opacity: clamp(transform.opacity * clipTransform.opacity, 0, 1)
		}
		const hasStyle = layer.text !== null && Object.keys(activeClip.textStyle).length > 0
		const text = hasStyle && layer.text !== null ? { ...layer.text, ...activeClip.textStyle } : layer.text
		return { ...layer, transform: combinedTransform, fx, text }
	})
}
