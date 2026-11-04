<script lang="ts">
	import { findLayerParam } from '../engine/layers'
	import { applyModulation } from '../engine/modulation'
	import { getLiveSignals } from '../store.svelte'
	import type { LayerParamKeyT, LayerT, ModulationT } from '../engine/types'
	import SettingSlider from './SettingSlider.svelte'

	type LayerParamSliderPropsT = {
		layer: LayerT
		paramKey: LayerParamKeyT
	}

	const props: LayerParamSliderPropsT = $props()

	const spec = $derived(findLayerParam(props.paramKey))
	const value = $derived(props.layer.transform[props.paramKey])
	const modulation = $derived(props.layer.modulations[props.paramKey] ?? null)

	const getLiveValue = (): number => {
		if (modulation === null) return value
		return applyModulation(value, spec, modulation, getLiveSignals())
	}

	const liveValue = $derived(getLiveValue())

	const handleChange = (nextValue: number) => {
		props.layer.transform[props.paramKey] = nextValue
	}

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
	{value}
	min={spec.min}
	max={spec.max}
	step={spec.step}
	suffix={spec.suffix}
	{modulation}
	{liveValue}
	onmodulationchange={handleModulationChange}
	onchange={handleChange}
/>
