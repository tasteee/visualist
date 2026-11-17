<script lang="ts">
	import { getLaneColor, getRowColor } from '../appearance.svelte'
	import XIcon from 'phosphor-svelte/lib/XIcon'
	import { automateTarget, automation, recordHistory, recordHistoryCoalesced, revealLane } from '../automation.svelte'
	import { checkIsLaneDriving, findLaneForTarget, getLiveLaneValue } from '../engine/automation'
	import { findClipAt, findFxSpec } from '../engine/layers'
	import { SHADER_EFFECT_KINDS } from '../engine/shaderEffects'
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
	import type { FoilSettingsT, HexGlitchSettingsT, LaneTargetT, LayerFxT, LayerT, MappingTargetT, ModulationT, ShaderFxSettingsT } from '../engine/types'
	import ColorPicker from './ColorPicker.svelte'
	import SettingSlider from './SettingSlider.svelte'
	import './FxRow.css'

	type FxRowPropsT = {
		layerId: string
		fx: LayerFxT
		clipId?: string
		onremove: () => void
	}

	const props: FxRowPropsT = $props()

	const spec = $derived(findFxSpec(props.fx.kind))
	const isClipEffect = $derived(props.clipId !== undefined)
	const isFoil = $derived(props.fx.kind === 'foil')
	const isHexGlitch = $derived(props.fx.kind === 'hexGlitch')
	const isShader = $derived(SHADER_EFFECT_KINDS.some((kind) => kind === props.fx.kind))
	const foilDefaults: FoilSettingsT = { colorA: 'accent-1', colorB: 'accent-2', scale: 1, speed: 1 }
	const foilSettings = $derived(props.fx.foil ?? foilDefaults)
	const hexGlitchDefaults: HexGlitchSettingsT = { tint: 'accent-1', scale: 1, speed: 1, bloom: 0.45, vignette: 0.5 }
	const hexGlitchSettings = $derived(props.fx.hexGlitch ?? hexGlitchDefaults)
	const shaderDefaults: ShaderFxSettingsT = { tint: 'accent-1', scale: 1, speed: 1 }
	const shaderSettings = $derived(props.fx.shader ?? shaderDefaults)
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

	const handleFoilColor = (key: 'colorA' | 'colorB', value: string) => {
		recordHistory()
		props.fx.foil = { ...foilSettings, [key]: value }
	}

	const handleFoilNumber = (key: 'scale' | 'speed', value: number) => {
		recordHistoryCoalesced(`foil:${props.fx.id}:${key}`)
		props.fx.foil = { ...foilSettings, [key]: value }
	}

	const handleHexGlitchTint = (value: string) => {
		recordHistory()
		props.fx.hexGlitch = { ...hexGlitchSettings, tint: value }
	}

	const handleHexGlitchNumber = (key: 'scale' | 'speed' | 'bloom' | 'vignette', value: number) => {
		recordHistoryCoalesced(`hex-glitch:${props.fx.id}:${key}`)
		props.fx.hexGlitch = { ...hexGlitchSettings, [key]: value }
	}

	const handleShaderTint = (value: string) => {
		recordHistory()
		props.fx.shader = { ...shaderSettings, tint: value }
	}

	const handleShaderNumber = (key: 'scale' | 'speed', value: number) => {
		recordHistoryCoalesced(`shader:${props.fx.id}:${key}`)
		props.fx.shader = { ...shaderSettings, [key]: value }
	}
</script>

<div class="fx-row-card">
	<z-row alignsY="center" gap="2" isFullWidth class="fx-row">
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
			onautomate={app.hasAudio && !isClipEffect ? handleAutomate : undefined}
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
	</z-row>
	{#if isFoil}
		<div class="fx-row-options">
			<ColorPicker value={foilSettings.colorA} label="Foil color one" onchange={(value: string) => handleFoilColor('colorA', value)} />
			<ColorPicker value={foilSettings.colorB} label="Foil color two" onchange={(value: string) => handleFoilColor('colorB', value)} />
			<SettingSlider label="Facet scale" value={foilSettings.scale} min={0.25} max={3} step={0.05} onchange={(value: number) => handleFoilNumber('scale', value)} />
			<SettingSlider label="Light speed" value={foilSettings.speed} min={0} max={3} step={0.05} onchange={(value: number) => handleFoilNumber('speed', value)} />
		</div>
	{/if}
	{#if isHexGlitch}
		<div class="fx-row-options">
			<ColorPicker value={hexGlitchSettings.tint} label="Hex glitch tint" onchange={handleHexGlitchTint} />
			<SettingSlider label="Hex scale" value={hexGlitchSettings.scale} min={0.25} max={3} step={0.05} onchange={(value: number) => handleHexGlitchNumber('scale', value)} />
			<SettingSlider label="Motion speed" value={hexGlitchSettings.speed} min={0} max={3} step={0.05} onchange={(value: number) => handleHexGlitchNumber('speed', value)} />
			<SettingSlider label="Bloom" value={hexGlitchSettings.bloom} min={0} max={1} step={0.01} onchange={(value: number) => handleHexGlitchNumber('bloom', value)} />
			<SettingSlider label="Vignette" value={hexGlitchSettings.vignette} min={0} max={1} step={0.01} onchange={(value: number) => handleHexGlitchNumber('vignette', value)} />
		</div>
	{/if}
	{#if isShader}
		<div class="fx-row-options">
			<ColorPicker value={shaderSettings.tint} label={`${spec.label} tint`} onchange={handleShaderTint} />
			<SettingSlider label="Pattern scale" value={shaderSettings.scale} min={0.25} max={3} step={0.05} onchange={(value: number) => handleShaderNumber('scale', value)} />
			<SettingSlider label="Motion speed" value={shaderSettings.speed} min={0} max={3} step={0.05} onchange={(value: number) => handleShaderNumber('speed', value)} />
		</div>
	{/if}
</div>
