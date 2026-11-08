<script lang="ts">
	import { getLaneColor, getRowColor } from '../appearance.svelte'
	import { automateTarget, automation, revealLane } from '../automation.svelte'
	import { checkIsLaneDriving, findLaneForTarget, getLiveLaneValue } from '../engine/automation'
	import { findClipAt, findLayerParam } from '../engine/layers'
	import { evaluateMappedValue } from '../engine/mappings'
	import { applyModulation } from '../engine/modulation'
	import { getRoleColor } from '../engine/palette'
	import type { ColorNameT } from '../engine/palette'
	import { layerStore } from '../layers.svelte'
	import { getMappingsForTarget, mappingsStore } from '../mappings.svelte'
	import { pickEmitterTrack, pickLane } from '../selection.svelte'
	import { findTrack, sources } from '../sources.svelte'
	import { app, getLiveSignals } from '../store.svelte'
	import { setEditorMode } from '../timeline.svelte'
	import type { LaneTargetT, LayerParamKeyT, LayerT, MappingTargetT, ModulationT } from '../engine/types'
	import SettingSlider from './SettingSlider.svelte'

	type LayerParamSliderPropsT = {
		layer: LayerT
		paramKey: LayerParamKeyT
	}

	const props: LayerParamSliderPropsT = $props()

	const target = $derived<LaneTargetT>({ kind: 'layer', layerId: props.layer.id, param: props.paramKey })
	const mappingTarget = $derived<MappingTargetT>({ kind: 'layer', layerId: props.layer.id, param: props.paramKey })
	const layers = $derived(layerStore.layers as LayerT[])
	const spec = $derived(findLayerParam(props.paramKey))
	const lane = $derived(findLaneForTarget(automation.lanes, target))
	const activeMappings = $derived(getMappingsForTarget(mappingTarget).filter((mapping) => !mapping.isBypassed))
	const firstMapping = $derived(activeMappings[0])
	const isAutomated = $derived((lane !== undefined && checkIsLaneDriving(lane)) || firstMapping !== undefined)

	const resolveBadgeColor = (): ColorNameT | null => {
		if (firstMapping !== undefined) {
			if (firstMapping.modulator.kind === 'emitter') {
				const track = findTrack(firstMapping.modulator.trackId)
				return track === undefined ? 'amber' : getRowColor(track.id, getRoleColor(track.role))
			}
			const laneId = firstMapping.modulator.kind === 'lane' ? firstMapping.modulator.laneId : ''
			const modLane = automation.lanes.find((candidate) => candidate.id === laneId)
			return modLane === undefined ? 'lavender' : getLaneColor(modLane, layers)
		}
		if (lane !== undefined && checkIsLaneDriving(lane)) return getLaneColor(lane, layers)
		return null
	}

	const resolveBadgeLabel = (): string => {
		if (firstMapping !== undefined) {
			if (firstMapping.modulator.kind === 'emitter') {
				const track = findTrack(firstMapping.modulator.trackId)
				return track?.name ?? 'Emitter'
			}
			const laneId = firstMapping.modulator.kind === 'lane' ? firstMapping.modulator.laneId : ''
			const modLane = automation.lanes.find((candidate) => candidate.id === laneId)
			return modLane?.name ?? 'Automation'
		}
		return 'Automated'
	}

	const automationColor = $derived(resolveBadgeColor())
	const automationBadgeLabel = $derived(resolveBadgeLabel())
	const modulation = $derived(props.layer.modulations[props.paramKey] ?? null)
	const baseValue = $derived(props.layer.transform[props.paramKey])

	const getLiveValue = (): number => {
		let value = baseValue
		if (lane !== undefined && checkIsLaneDriving(lane)) {
			value = getLiveLaneValue(lane, app.settings, layers, app.currentTime) ?? value
		}
		if (activeMappings.length > 0) {
			const modContext = { tracks: sources.tracks, lanes: automation.lanes }
			const activeClip = findClipAt(props.layer, app.currentTime)
			value = evaluateMappedValue(value, spec.min, spec.max, mappingTarget, activeMappings, modContext, activeClip, app.currentTime)
		}
		if (modulation !== null) {
			value = applyModulation(value, spec, modulation, getLiveSignals())
		}
		return value
	}

	const liveValue = $derived(getLiveValue())

	const handleChange = (nextValue: number) => {
		props.layer.transform[props.paramKey] = nextValue
	}

	const handleReveal = () => {
		if (firstMapping !== undefined) {
			setEditorMode('modulation')
			if (firstMapping.modulator.kind === 'emitter') return pickEmitterTrack(firstMapping.modulator.trackId)
			pickLane(firstMapping.modulator.laneId, [firstMapping.modulator.laneId], { isRange: false, isToggle: false })
			revealLane(firstMapping.modulator.laneId)
			return
		}
		if (lane === undefined) return
		revealLane(lane.id)
	}

	const handleAutomate = () => automateTarget(target)

	const handleModulationChange = (nextModulation: ModulationT | null) => {
		const isRemoved = nextModulation === null
		if (isRemoved) {
			delete props.layer.modulations[props.paramKey]
			return
		}
		props.layer.modulations[props.paramKey] = nextModulation
	}
</script>

<SettingSlider
	label={spec.label}
	value={baseValue}
	min={spec.min}
	max={spec.max}
	step={spec.step}
	suffix={spec.suffix}
	{automationColor}
	{automationBadgeLabel}
	onreveal={handleReveal}
	onautomate={app.hasAudio ? handleAutomate : undefined}
	{modulation}
	{liveValue}
	onmodulationchange={handleModulationChange}
	onchange={handleChange}
/>
