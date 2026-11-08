<script lang="ts">
	import { getLaneColor, getRowColor } from '../appearance.svelte'
	import XIcon from 'phosphor-svelte/lib/XIcon'
	import { automateTarget, automation, revealLane } from '../automation.svelte'
	import { checkIsLaneDriving, findLaneForTarget, getLiveLaneValue } from '../engine/automation'
	import { findClipAt, findFxSpec } from '../engine/layers'
	import { evaluateMappedValue } from '../engine/mappings'
	import { applyModulation } from '../engine/modulation'
	import { getRoleColor } from '../engine/palette'
	import type { ColorNameT } from '../engine/palette'
	import { layerStore } from '../layers.svelte'
	import { getMappingsForTarget } from '../mappings.svelte'
	import { pickEmitterTrack, pickLane } from '../selection.svelte'
	import { findTrack, sources } from '../sources.svelte'
	import { app, getLiveSignals } from '../store.svelte'
	import { setEditorMode } from '../timeline.svelte'
	import type { LaneTargetT, LayerFxT, LayerT, MappingTargetT, ModulationT } from '../engine/types'
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
	const mappingTarget = $derived<MappingTargetT>({ kind: 'fx', layerId: props.layerId, fxId: props.fx.id })
	const layers = $derived(layerStore.layers as LayerT[])
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
	const baseValue = $derived(props.fx.amount)

	const getLiveValue = (): number => {
		let value = baseValue
		if (lane !== undefined && checkIsLaneDriving(lane)) {
			value = getLiveLaneValue(lane, app.settings, layers, app.currentTime) ?? value
		}
		if (activeMappings.length > 0) {
			const modContext = { tracks: sources.tracks, lanes: automation.lanes }
			const layer = layers.find((candidate) => candidate.id === props.layerId)
			const activeClip = layer === undefined ? undefined : findClipAt(layer, app.currentTime)
			value = evaluateMappedValue(value, spec.min, spec.max, mappingTarget, activeMappings, modContext, activeClip, app.currentTime)
		}
		const modulation = props.fx.modulation
		if (modulation !== null) {
			value = applyModulation(value, spec, modulation, getLiveSignals())
		}
		return value
	}

	const liveValue = $derived(getLiveValue())
	const removeLabel = $derived(`Remove ${spec.label}`)

	const handleChange = (value: number) => {
		props.fx.amount = value
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
			{automationColor}
			{automationBadgeLabel}
			onreveal={handleReveal}
			onautomate={app.hasAudio ? handleAutomate : undefined}
			modulation={props.fx.modulation}
			{liveValue}
			onmodulationchange={handleModulationChange}
			onchange={handleChange}
		/>
	</div>
	<z-tooltip content={removeLabel} placement="left" openDelay={300}>
		<z-button isIcon size="sm" kind="ghost" tone="neutral" aria-label={removeLabel} onclick={props.onremove}>
			<XIcon weight="bold" />
		</z-button>
	</z-tooltip>
</div>
