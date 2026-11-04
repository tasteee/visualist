<script lang="ts">
	import XIcon from 'phosphor-svelte/lib/XIcon'
	import { findFxSpec } from '../engine/layers'
	import { applyModulation } from '../engine/modulation'
	import { getLiveSignals } from '../store.svelte'
	import type { LayerFxT, ModulationT } from '../engine/types'
	import SettingSlider from './SettingSlider.svelte'
	import './FxRow.css'

	type FxRowPropsT = {
		fx: LayerFxT
		onremove: () => void
	}

	const props: FxRowPropsT = $props()

	const spec = $derived(findFxSpec(props.fx.kind))

	const getLiveValue = (): number => {
		const modulation = props.fx.modulation
		if (modulation === null) return props.fx.amount
		return applyModulation(props.fx.amount, spec, modulation, getLiveSignals())
	}

	const liveValue = $derived(getLiveValue())
	const removeLabel = $derived(`Remove ${spec.label}`)

	const handleChange = (value: number) => {
		props.fx.amount = value
	}

	const handleModulationChange = (modulation: ModulationT | null) => {
		props.fx.modulation = modulation
	}
</script>

<div class="fx-row">
	<div class="fx-row-slider">
		<SettingSlider
			label={spec.label}
			hint={spec.hint}
			value={props.fx.amount}
			min={spec.min}
			max={spec.max}
			step={spec.step}
			modulation={props.fx.modulation}
			{liveValue}
			onmodulationchange={handleModulationChange}
			onchange={handleChange}
		/>
	</div>
	<z-tooltip content={removeLabel} placement="left" openDelay={300}>
		<button class="fx-row-remove" type="button" aria-label={removeLabel} onclick={props.onremove}>
			<XIcon weight="bold" />
		</button>
	</z-tooltip>
</div>
