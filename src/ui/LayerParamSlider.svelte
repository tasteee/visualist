<script lang="ts">
	import { automateTarget, automation, revealLane } from '../automation.svelte'
	import { findLaneForTarget, getLiveLaneValue, getTargetTone } from '../engine/automation'
	import { findLayerParam } from '../engine/layers'
	import { applyModulation } from '../engine/modulation'
	import { layerStore } from '../layers.svelte'
	import { app, getLiveSignals } from '../store.svelte'
	import type { LaneTargetT, LayerParamKeyT, LayerT, ModulationT } from '../engine/types'
	import SettingSlider from './SettingSlider.svelte'

	type LayerParamSliderPropsT = {
		layer: LayerT
		paramKey: LayerParamKeyT
	}

	const props: LayerParamSliderPropsT = $props()

	const target = $derived<LaneTargetT>({ kind: 'layer', layerId: props.layer.id, param: props.paramKey })
	const layers = $derived(layerStore.layers as LayerT[])
	const spec = $derived(findLayerParam(props.paramKey))
	const lane = $derived(findLaneForTarget(automation.lanes, target))
	const isAutomated = $derived(lane !== undefined && lane.points.length > 0)
	const automationTone = $derived(isAutomated ? getTargetTone(target, layers) : 0)
	const modulation = $derived(props.layer.modulations[props.paramKey] ?? null)

	// An automated param follows its lane at the playhead and
	// locks, like the global controls.
	const getBaseValue = (): number => {
		const ownValue = props.layer.transform[props.paramKey]
		if (!isAutomated || lane === undefined) return ownValue
		const laneValue = getLiveLaneValue(lane, app.settings, layers, app.currentTime)
		return laneValue ?? ownValue
	}

	const baseValue = $derived(getBaseValue())

	const getLiveValue = (): number => {
		if (modulation === null) return baseValue
		return applyModulation(baseValue, spec, modulation, getLiveSignals())
	}

	const liveValue = $derived(getLiveValue())

	const handleChange = (nextValue: number) => {
		props.layer.transform[props.paramKey] = nextValue
	}

	const handleReveal = () => {
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
	{automationTone}
	onreveal={handleReveal}
	onautomate={app.hasAudio ? handleAutomate : undefined}
	{modulation}
	{liveValue}
	onmodulationchange={handleModulationChange}
	onchange={handleChange}
/>
