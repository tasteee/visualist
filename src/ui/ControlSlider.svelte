<script lang="ts">
	import { automateTarget, automation, revealLane } from '../automation.svelte'
	import { findControl, findLaneForTarget, getLiveLaneValue, getTargetTone } from '../engine/automation'
	import { applyModulation } from '../engine/modulation'
	import { app, getLiveSignals } from '../store.svelte'
	import type { AutomatableKeyT, LaneTargetT, ModulationT } from '../engine/types'
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

	const target = $derived<LaneTargetT>({ kind: 'setting', key: props.controlKey })
	const control = $derived(findControl(props.controlKey))
	const min = $derived(control === null ? 0 : control.min)
	const max = $derived(control === null ? 1 : control.max)
	const step = $derived(control === null ? 0.01 : control.step)
	const lane = $derived(findLaneForTarget(automation.lanes, target))
	const isAutomated = $derived(lane !== undefined && lane.points.length > 0)
	const automationTone = $derived(isAutomated ? getTargetTone(target, []) : 0)
	const modulation = $derived(app.settings.modulations[props.controlKey] ?? null)

	// Automated sliders follow the playhead and lock until the
	// lane's points are removed.
	const getBaseValue = (): number => {
		const baseSetting = app.settings[props.controlKey]
		if (!isAutomated || lane === undefined) return baseSetting
		const laneValue = getLiveLaneValue(lane, app.settings, [], app.currentTime)
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

	const handleAutomate = () => automateTarget(target)

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
	onautomate={app.hasAudio ? handleAutomate : undefined}
	{modulation}
	{liveValue}
	onmodulationchange={handleModulationChange}
	onchange={handleChange}
/>
