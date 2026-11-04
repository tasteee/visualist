<script lang="ts">
	import { automation, revealLane } from '../automation.svelte'
	import { findControl, findLaneForControl, getControlTone, getLiveControlValue } from '../engine/automation'
	import { applyModulation } from '../engine/modulation'
	import { app, getLiveSignals } from '../store.svelte'
	import type { AutomatableKeyT, ModulationT } from '../engine/types'
	import SettingSlider from './SettingSlider.svelte'

	// One global setting, wired to its automation lane and its
	// modulation, so every panel treats controls the same way.
	type ControlSliderPropsT = {
		controlKey: AutomatableKeyT
		label: string
		hint?: string
		isDisabled?: boolean
	}

	const props: ControlSliderPropsT = $props()

	const control = $derived(findControl(props.controlKey))
	const min = $derived(control === null ? 0 : control.min)
	const max = $derived(control === null ? 1 : control.max)
	const step = $derived(control === null ? 0.01 : control.step)
	const lane = $derived(findLaneForControl(automation.lanes, props.controlKey))
	const isAutomated = $derived(lane !== undefined && lane.points.length > 0)
	const automationTone = $derived(isAutomated ? getControlTone(props.controlKey) : 0)
	const modulation = $derived(app.settings.modulations[props.controlKey] ?? null)

	// Automated sliders follow the playhead and lock until the
	// lane's points are removed.
	const getBaseValue = (): number => {
		const baseSetting = app.settings[props.controlKey]
		if (!isAutomated || lane === undefined) return baseSetting
		const laneValue = getLiveControlValue(lane, app.settings, app.currentTime)
		return laneValue ?? baseSetting
	}

	const baseValue = $derived(getBaseValue())

	// Only modulated sliders follow the live signals, so idle
	// ones do not redraw on every frame.
	const getLiveValue = (): number => {
		if (modulation === null) return baseValue
		return applyModulation(baseValue, { min, max }, modulation, getLiveSignals())
	}

	const liveValue = $derived(getLiveValue())

	const handleChange = (value: number) => {
		app.settings[props.controlKey] = value
	}

	const handleReveal = () => {
		if (lane === undefined) return
		revealLane(lane.id)
	}

	const handleModulationChange = (nextModulation: ModulationT | null) => {
		const isRemoved = nextModulation === null
		if (isRemoved) {
			delete app.settings.modulations[props.controlKey]
			return
		}
		app.settings.modulations[props.controlKey] = nextModulation
	}
</script>

<SettingSlider
	label={props.label}
	hint={props.hint}
	value={baseValue}
	{min}
	{max}
	{step}
	isDisabled={props.isDisabled}
	{automationTone}
	onreveal={handleReveal}
	{modulation}
	{liveValue}
	onmodulationchange={handleModulationChange}
	onchange={handleChange}
/>
