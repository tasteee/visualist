<script lang="ts">
	import { getLaneColor, getRowColor } from '../appearance.svelte'
	import { automateTarget, automation, revealLane } from '../automation.svelte'
	import { checkIsLaneDriving, findControl, findLaneForTarget, getLiveLaneValue } from '../engine/automation'
	import { evaluateMappedValue } from '../engine/mappings'
	import { applyModulation } from '../engine/modulation'
	import { getRoleColor } from '../engine/palette'
	import type { ColorNameT } from '../engine/palette'
	import { getMappingsForTarget } from '../mappings.svelte'
	import { pickEmitterTrack, pickLane } from '../selection.svelte'
	import { findTrack, sources } from '../sources.svelte'
	import { app, getLiveSignals } from '../store.svelte'
	import { setEditorMode } from '../timeline.svelte'
	import type { AutomatableKeyT, LaneTargetT, MappingTargetT, ModulationT } from '../engine/types'
	import SettingSlider from './SettingSlider.svelte'

	type ControlSliderPropsT = {
		controlKey: AutomatableKeyT
		label: string
		hint?: string
		isDisabled?: boolean
	}

	const props: ControlSliderPropsT = $props()

	const target = $derived<LaneTargetT>({ kind: 'setting', key: props.controlKey })
	const mappingTarget = $derived<MappingTargetT>({ kind: 'setting', key: props.controlKey })
	const control = $derived(findControl(props.controlKey))
	const min = $derived(control === null ? 0 : control.min)
	const max = $derived(control === null ? 1 : control.max)
	const step = $derived(control === null ? 0.01 : control.step)
	const lane = $derived(findLaneForTarget(automation.lanes, target))
	const activeMappings = $derived(getMappingsForTarget(mappingTarget).filter((mapping) => !mapping.isBypassed))
	const firstMapping = $derived(activeMappings[0])

	const resolveBadgeColor = (): ColorNameT | null => {
		if (firstMapping !== undefined) {
			if (firstMapping.modulator.kind === 'emitter') {
				const track = findTrack(firstMapping.modulator.trackId)
				return track === undefined ? 'amber' : getRowColor(track.id, getRoleColor(track.role))
			}
			const laneId = firstMapping.modulator.kind === 'lane' ? firstMapping.modulator.laneId : ''
			const modLane = automation.lanes.find((candidate) => candidate.id === laneId)
			return modLane === undefined ? 'lavender' : getLaneColor(modLane, [])
		}
		if (lane !== undefined && checkIsLaneDriving(lane)) return getLaneColor(lane, [])
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
	const modulation = $derived(app.settings.modulations[props.controlKey] ?? null)
	const baseValue = $derived(app.settings[props.controlKey])

	const getLiveValue = (): number => {
		let value = baseValue
		if (lane !== undefined && checkIsLaneDriving(lane)) {
			value = getLiveLaneValue(lane, app.settings, [], app.currentTime) ?? value
		}
		if (activeMappings.length > 0) {
			const modContext = { tracks: sources.tracks, lanes: automation.lanes }
			value = evaluateMappedValue(value, min, max, mappingTarget, activeMappings, modContext, undefined, app.currentTime)
		}
		if (modulation !== null) {
			value = applyModulation(value, { min, max }, modulation, getLiveSignals())
		}
		return value
	}

	const liveValue = $derived(getLiveValue())

	const handleChange = (value: number) => {
		app.settings[props.controlKey] = value
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
	{automationColor}
	{automationBadgeLabel}
	onreveal={handleReveal}
	onautomate={app.hasAudio ? handleAutomate : undefined}
	{modulation}
	{liveValue}
	onmodulationchange={handleModulationChange}
	onchange={handleChange}
/>
