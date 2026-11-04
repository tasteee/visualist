<script lang="ts">
	import XIcon from 'phosphor-svelte/lib/XIcon'
	import { automateTarget, automation, revealLane } from '../automation.svelte'
	import { findLaneForTarget, getLiveLaneValue, getTargetTone } from '../engine/automation'
	import { findFxSpec } from '../engine/layers'
	import { applyModulation } from '../engine/modulation'
	import { layerStore } from '../layers.svelte'
	import { app, getLiveSignals } from '../store.svelte'
	import type { LaneTargetT, LayerFxT, LayerT, ModulationT } from '../engine/types'
	import SettingSlider from './SettingSlider.svelte'
	import './FxRow.css'

	type FxRowPropsT = {
		layerId: string
		fx: LayerFxT
		onremove: () => void
	}

	const props: FxRowPropsT = $props()

	const spec = $derived(findFxSpec(props.fx.kind))
	const target = $derived<LaneTargetT>({ kind: 'fx', layerId: props.layerId, fxId: props.fx.id })
	const layers = $derived(layerStore.layers as LayerT[])
	const lane = $derived(findLaneForTarget(automation.lanes, target))
	const isAutomated = $derived(lane !== undefined && lane.points.length > 0)
	const automationTone = $derived(isAutomated ? getTargetTone(target, layers) : 0)

	const getBaseValue = (): number => {
		if (!isAutomated || lane === undefined) return props.fx.amount
		const laneValue = getLiveLaneValue(lane, app.settings, layers, app.currentTime)
		return laneValue ?? props.fx.amount
	}

	const baseValue = $derived(getBaseValue())

	const getLiveValue = (): number => {
		const modulation = props.fx.modulation
		if (modulation === null) return baseValue
		return applyModulation(baseValue, spec, modulation, getLiveSignals())
	}

	const liveValue = $derived(getLiveValue())
	const removeLabel = $derived(`Remove ${spec.label}`)

	const handleChange = (value: number) => {
		props.fx.amount = value
	}

	const handleReveal = () => {
		if (lane === undefined) return
		revealLane(lane.id)
	}

	const handleAutomate = () => automateTarget(target)

	const handleModulationChange = (modulation: ModulationT | null) => {
		props.fx.modulation = modulation
	}
</script>

<div class="fx-row">
	<div class="fx-row-slider">
		<SettingSlider
			label={spec.label}
			hint={spec.hint}
			value={baseValue}
			min={spec.min}
			max={spec.max}
			step={spec.step}
			{automationTone}
			onreveal={handleReveal}
			onautomate={app.hasAudio ? handleAutomate : undefined}
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
