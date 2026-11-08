import {
	DEFAULT_INFLUENCE,
	MAX_ATTACK_MS,
	MAX_DECAY_MS,
	MAX_ENVELOPE_CURVE,
	MIN_ATTACK_MS,
	MIN_DECAY_MS,
	MIN_ENVELOPE_CURVE,
	checkIsSameMappingTarget,
	checkIsSameModulator,
	createDefaultEnvelope
} from './engine/mappings'
import { clamp } from './engine/settings'
import type { AdEnvelopeT, MappingT, MappingTargetT, MappingTimeModeT, ModulatorRefT } from './engine/types'

type MappingsStoreT = {
	list: MappingT[]
	selectedModulator: ModulatorRefT | null
}

const STORAGE_KEY = 'vink.mappings.v1'

const checkIsMappingShape = (candidate: Partial<MappingT>): candidate is MappingT => {
	const hasId = typeof candidate.id === 'string'
	const hasModulator = typeof candidate.modulator === 'object' && candidate.modulator !== null
	const hasTarget = typeof candidate.target === 'object' && candidate.target !== null
	return hasId && hasModulator && hasTarget
}

const normalizeMapping = (stored: Partial<MappingT>): MappingT | null => {
	if (!checkIsMappingShape(stored)) return null
	const defaultTimeMode: MappingTimeModeT = stored.target.kind === 'clip' ? 'clip' : 'song'
	return {
		id: stored.id,
		modulator: stored.modulator,
		target: stored.target,
		influence: clamp(stored.influence ?? DEFAULT_INFLUENCE, -1, 1),
		timeMode: stored.timeMode ?? defaultTimeMode,
		envelope: { ...createDefaultEnvelope(), ...stored.envelope },
		isBypassed: stored.isBypassed === true
	}
}

const loadMappings = (): MappingT[] => {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		if (raw === null) return []
		const parsed = JSON.parse(raw) as Partial<MappingT>[]
		if (!Array.isArray(parsed)) return []
		return parsed.map(normalizeMapping).filter((mapping): mapping is MappingT => mapping !== null)
	} catch {
		return []
	}
}

const saveMappings = (list: MappingT[]): void => {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
	} catch {
		return
	}
}

export const mappingsStore = $state<MappingsStoreT>({
	list: loadMappings(),
	selectedModulator: null
})

export const takeMappingsSnapshot = (): MappingT[] => $state.snapshot(mappingsStore.list) as MappingT[]

export const restoreMappingsSnapshot = (snapshot: MappingT[]): void => {
	mappingsStore.list = snapshot
}

export const selectModulator = (modulator: ModulatorRefT | null): void => {
	mappingsStore.selectedModulator = modulator
}

export const getMappingsForModulator = (modulator: ModulatorRefT): MappingT[] => {
	return mappingsStore.list.filter((mapping) => checkIsSameModulator(mapping.modulator, modulator))
}

export const getMappingsForTarget = (target: MappingTargetT): MappingT[] => {
	return mappingsStore.list.filter((mapping) => checkIsSameMappingTarget(mapping.target, target))
}

export const checkIsLayerModulated = (layerId: string): boolean => {
	return mappingsStore.list.some((mapping) => !mapping.isBypassed && mapping.target.kind !== 'setting' && mapping.target.layerId === layerId)
}

export const createMapping = (modulator: ModulatorRefT, target: MappingTargetT, influence = DEFAULT_INFLUENCE): MappingT => {
	const timeMode: MappingTimeModeT = target.kind === 'clip' ? 'clip' : 'song'
	return {
		id: crypto.randomUUID(),
		modulator,
		target,
		influence: clamp(influence, -1, 1),
		timeMode,
		envelope: createDefaultEnvelope(),
		isBypassed: false
	}
}

export const addMapping = (modulator: ModulatorRefT, target: MappingTargetT, onBeforeChange?: () => void): MappingT => {
	onBeforeChange?.()
	const mapping = createMapping(modulator, target)
	mappingsStore.list.push(mapping)
	return mapping
}

export const removeMapping = (mappingId: string, onBeforeChange?: () => void): void => {
	const exists = mappingsStore.list.some((mapping) => mapping.id === mappingId)
	if (!exists) return
	onBeforeChange?.()
	mappingsStore.list = mappingsStore.list.filter((mapping) => mapping.id !== mappingId)
}

export const setMappingTarget = (mappingId: string, target: MappingTargetT, onBeforeChange?: () => void): void => {
	const mapping = mappingsStore.list.find((candidate) => candidate.id === mappingId)
	if (mapping === undefined) return
	if (checkIsSameMappingTarget(mapping.target, target)) return
	onBeforeChange?.()
	const wasClip = mapping.target.kind === 'clip'
	const isClip = target.kind === 'clip'
	mapping.target = target
	if (!wasClip && isClip) mapping.timeMode = 'clip'
	if (wasClip && !isClip) mapping.timeMode = 'song'
}

export const setMappingInfluence = (mappingId: string, influence: number, onBeforeChange?: () => void): void => {
	const mapping = mappingsStore.list.find((candidate) => candidate.id === mappingId)
	if (mapping === undefined) return
	const clamped = clamp(influence, -1, 1)
	if (mapping.influence === clamped) return
	onBeforeChange?.()
	mapping.influence = clamped
}

export const setMappingTimeMode = (mappingId: string, timeMode: MappingTimeModeT, onBeforeChange?: () => void): void => {
	const mapping = mappingsStore.list.find((candidate) => candidate.id === mappingId)
	if (mapping === undefined || mapping.timeMode === timeMode) return
	onBeforeChange?.()
	mapping.timeMode = timeMode
}

export const setMappingEnvelope = (mappingId: string, patch: Partial<AdEnvelopeT>, onBeforeChange?: () => void): void => {
	const mapping = mappingsStore.list.find((candidate) => candidate.id === mappingId)
	if (mapping === undefined) return
	onBeforeChange?.()
	const next: AdEnvelopeT = {
		attackMs: clamp(patch.attackMs ?? mapping.envelope.attackMs, MIN_ATTACK_MS, MAX_ATTACK_MS),
		attackCurve: clamp(patch.attackCurve ?? mapping.envelope.attackCurve, MIN_ENVELOPE_CURVE, MAX_ENVELOPE_CURVE),
		decayMs: clamp(patch.decayMs ?? mapping.envelope.decayMs, MIN_DECAY_MS, MAX_DECAY_MS),
		decayCurve: clamp(patch.decayCurve ?? mapping.envelope.decayCurve, MIN_ENVELOPE_CURVE, MAX_ENVELOPE_CURVE)
	}
	mapping.envelope = next
}

export const toggleMappingBypassed = (mappingId: string, onBeforeChange?: () => void): void => {
	const mapping = mappingsStore.list.find((candidate) => candidate.id === mappingId)
	if (mapping === undefined) return
	onBeforeChange?.()
	mapping.isBypassed = !mapping.isBypassed
}

// When a clip is sliced (Ctrl+E) into originalClipId and newClipId,
// clone any mappings targeting originalClipId onto newClipId.
export const cloneMappingsForSlicedClip = (layerId: string, originalClipId: string, newClipId: string): void => {
	const clipMappings = mappingsStore.list.filter(
		(mapping) => mapping.target.kind === 'clip' && mapping.target.layerId === layerId && mapping.target.clipId === originalClipId
	)
	for (const sourceMapping of clipMappings) {
		if (sourceMapping.target.kind !== 'clip') continue
		const cloned: MappingT = {
			...($state.snapshot(sourceMapping) as MappingT),
			id: crypto.randomUUID(),
			target: {
				kind: 'clip',
				layerId,
				clipId: newClipId,
				param: sourceMapping.target.param
			}
		}
		mappingsStore.list.push(cloned)
	}
}

export const removeMappingsForModulator = (modulator: ModulatorRefT): void => {
	mappingsStore.list = mappingsStore.list.filter((mapping) => !checkIsSameModulator(mapping.modulator, modulator))
	if (mappingsStore.selectedModulator !== null && checkIsSameModulator(mappingsStore.selectedModulator, modulator)) {
		mappingsStore.selectedModulator = null
	}
}

export const removeMappingsForLayer = (layerId: string): void => {
	mappingsStore.list = mappingsStore.list.filter((mapping) => mapping.target.kind === 'setting' || mapping.target.layerId !== layerId)
}

export const removeMappingsForClip = (clipId: string): void => {
	mappingsStore.list = mappingsStore.list.filter((mapping) => mapping.target.kind !== 'clip' || mapping.target.clipId !== clipId)
}

export const removeMappingsForFx = (fxId: string): void => {
	mappingsStore.list = mappingsStore.list.filter((mapping) => mapping.target.kind !== 'fx' || mapping.target.fxId !== fxId)
}

export const startMappingsWatchers = (): void => {
	$effect.root(() => {
		$effect(() => {
			saveMappings($state.snapshot(mappingsStore.list) as MappingT[])
		})
	})
}
