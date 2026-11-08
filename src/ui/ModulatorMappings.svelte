<script lang="ts">
	import EyeIcon from 'phosphor-svelte/lib/EyeIcon'
	import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlashIcon'
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon'
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon'
	import { recordHistory, recordHistoryCoalesced } from '../automation.svelte'
	import {
		MAX_ATTACK_MS,
		MAX_DECAY_MS,
		MAX_ENVELOPE_CURVE,
		MIN_ATTACK_MS,
		MIN_DECAY_MS,
		MIN_ENVELOPE_CURVE,
		evaluateSingleAd,
		getMappingTargetKey,
		listAllMappingTargets
	} from '../engine/mappings'
	import type { AdEnvelopeT, LayerT, MappingT, MappingTimeModeT, ModulatorRefT } from '../engine/types'
	import { layerStore } from '../layers.svelte'
	import {
		addMapping,
		getMappingsForModulator,
		removeMapping,
		setMappingEnvelope,
		setMappingInfluence,
		setMappingTarget,
		setMappingTimeMode,
		toggleMappingBypassed
	} from '../mappings.svelte'
	import Section from './Section.svelte'
	import Segmented from './Segmented.svelte'
	import SettingSlider from './SettingSlider.svelte'
	import './ModulatorMappings.css'

	type ModulatorMappingsPropsT = {
		modulator: ModulatorRefT
	}

	const props: ModulatorMappingsPropsT = $props()

	const SVG_WIDTH = 160
	const SVG_HEIGHT = 64
	const SVG_SAMPLES = 40

	const TIME_MODE_OPTIONS = [
		{ value: 'song', label: 'Song Time' },
		{ value: 'clip', label: 'Clip Time' }
	]

	const layers = $derived(layerStore.layers as LayerT[])
	const mappings = $derived(getMappingsForModulator(props.modulator))
	const targetOptions = $derived(listAllMappingTargets(layers))
	const selectOptions = $derived(targetOptions.map((option) => ({ value: option.value, label: option.label })))
	const isEmitter = $derived(props.modulator.kind === 'emitter')
	const canAdd = $derived(targetOptions.length > 0)

	const handleAddMapping = () => {
		const firstOption = targetOptions[0]
		if (firstOption === undefined) return
		addMapping(props.modulator, firstOption.target, recordHistory)
	}

	const handleTargetChange = (mapping: MappingT, event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		const match = targetOptions.find((option) => option.value === detail.value)
		if (match === undefined) return
		setMappingTarget(mapping.id, match.target, recordHistory)
	}

	const handleInfluenceChange = (mapping: MappingT, percent: number) => {
		setMappingInfluence(mapping.id, percent / 100, () => recordHistoryCoalesced(`map-inf:${mapping.id}`))
	}

	const handleTimeModeChange = (mapping: MappingT, value: string) => {
		const mode: MappingTimeModeT = value === 'clip' ? 'clip' : 'song'
		setMappingTimeMode(mapping.id, mode, recordHistory)
	}

	const handleEnvelopePatch = (mapping: MappingT, patch: Partial<AdEnvelopeT>, key: string) => {
		setMappingEnvelope(mapping.id, patch, () => recordHistoryCoalesced(`map-env:${mapping.id}:${key}`))
	}

	const handleBypass = (mapping: MappingT) => {
		toggleMappingBypassed(mapping.id, recordHistory)
	}

	const handleRemove = (mapping: MappingT) => {
		removeMapping(mapping.id, recordHistory)
	}

	const buildEnvelopeLinePath = (envelope: AdEnvelopeT): string => {
		const totalSeconds = Math.max(0.01, (envelope.attackMs + envelope.decayMs) / 1000)
		const commands: string[] = []
		for (let stepIndex = 0; stepIndex <= SVG_SAMPLES; stepIndex++) {
			const ratio = stepIndex / SVG_SAMPLES
			const ageSeconds = ratio * totalSeconds
			const gain = evaluateSingleAd(ageSeconds, envelope)
			const xCoord = (ratio * SVG_WIDTH).toFixed(2)
			const yCoord = ((1 - gain) * (SVG_HEIGHT - 8) + 4).toFixed(2)
			const verb = stepIndex === 0 ? 'M' : 'L'
			commands.push(`${verb}${xCoord} ${yCoord}`)
		}
		return commands.join(' ')
	}

	const buildEnvelopeAreaPath = (envelope: AdEnvelopeT): string => {
		const line = buildEnvelopeLinePath(envelope)
		return `${line} L${SVG_WIDTH} ${SVG_HEIGHT} L0 ${SVG_HEIGHT} Z`
	}

	const getAttackPeakX = (envelope: AdEnvelopeT): number => {
		const totalMs = Math.max(10, envelope.attackMs + envelope.decayMs)
		return (envelope.attackMs / totalMs) * SVG_WIDTH
	}
</script>

<Section title="Mappings" description="Route this modulator (0–100%) to any layer, clip, effect, or stage control.">
	<z-button size="sm" kind="soft" tone="primary" isFullWidth isDisabled={!canAdd} onclick={handleAddMapping}>
		<PlusIcon weight="bold" />
		Add Mapping
	</z-button>

	{#if mappings.length === 0}
		<p class="modulator-mappings-empty">No mappings yet. Add a mapping to drive any parameter with signed additive influence.</p>
	{/if}

	<div class="modulator-mappings-list">
		{#each mappings as mapping (mapping.id)}
			{@const targetKey = getMappingTargetKey(mapping.target)}
			{@const influencePercent = Math.round(mapping.influence * 100)}
			{@const peakX = getAttackPeakX(mapping.envelope)}
			<div class="modulator-mapping-card" class:isBypassed={mapping.isBypassed}>
				<div class="modulator-mapping-header">
					<z-select
						class="modulator-mapping-select"
						size="sm"
						value={targetKey}
						options={selectOptions}
						placeholder="Choose target"
						aria-label="Mapping target"
						onchange={(event: Event) => handleTargetChange(mapping, event)}
					></z-select>
					<div class="modulator-mapping-actions">
						<z-tooltip content={mapping.isBypassed ? 'Enable mapping' : 'Bypass mapping'} placement="top">
							<z-button isIcon size="sm" kind="ghost" tone="neutral" aria-label={mapping.isBypassed ? 'Enable mapping' : 'Bypass mapping'} aria-pressed={mapping.isBypassed} onclick={() => handleBypass(mapping)}>
								{#if mapping.isBypassed}
									<EyeSlashIcon weight="bold" />
								{:else}
									<EyeIcon weight="bold" />
								{/if}
							</z-button>
						</z-tooltip>
						<z-tooltip content="Remove mapping" placement="top">
							<z-button isIcon size="sm" kind="ghost" tone="danger" aria-label="Remove mapping" onclick={() => handleRemove(mapping)}>
								<TrashIcon weight="bold" />
							</z-button>
						</z-tooltip>
					</div>
				</div>

				<SettingSlider
					label="Influence"
					value={influencePercent}
					min={-100}
					max={100}
					step={1}
					suffix="%"
					onchange={(value: number) => handleInfluenceChange(mapping, value)}
				/>

				<div class="modulator-mapping-mode">
					<span class="modulator-mapping-sublabel">Timing</span>
					<Segmented
						label="Mapping timing mode"
						options={TIME_MODE_OPTIONS}
						value={mapping.timeMode}
						onchange={(value: string) => handleTimeModeChange(mapping, value)}
					/>
				</div>

				{#if isEmitter}
					<div class="modulator-mapping-envelope">
						<div class="modulator-mapping-envelope-header">
							<span class="modulator-mapping-sublabel">One-Shot AD Envelope</span>
							<span class="modulator-mapping-envelope-meta">{mapping.envelope.attackMs}ms + {mapping.envelope.decayMs}ms</span>
						</div>
						<svg class="modulator-mapping-graph" viewBox="0 0 {SVG_WIDTH} {SVG_HEIGHT}" preserveAspectRatio="none" aria-hidden="true">
							<path class="modulator-mapping-graph-area" d={buildEnvelopeAreaPath(mapping.envelope)} />
							<line class="modulator-mapping-graph-peak" x1={peakX} x2={peakX} y1="4" y2={SVG_HEIGHT} />
							<path class="modulator-mapping-graph-line" d={buildEnvelopeLinePath(mapping.envelope)} />
						</svg>
						<SettingSlider
							label="Attack"
							value={mapping.envelope.attackMs}
							min={MIN_ATTACK_MS}
							max={MAX_ATTACK_MS}
							step={5}
							suffix=" ms"
							onchange={(value: number) => handleEnvelopePatch(mapping, { attackMs: value }, 'attackMs')}
						/>
						<SettingSlider
							label="Attack curve"
							value={mapping.envelope.attackCurve}
							min={MIN_ENVELOPE_CURVE}
							max={MAX_ENVELOPE_CURVE}
							step={1}
							suffix="%"
							onchange={(value: number) => handleEnvelopePatch(mapping, { attackCurve: value }, 'attackCurve')}
						/>
						<SettingSlider
							label="Decay"
							value={mapping.envelope.decayMs}
							min={MIN_DECAY_MS}
							max={MAX_DECAY_MS}
							step={10}
							suffix=" ms"
							onchange={(value: number) => handleEnvelopePatch(mapping, { decayMs: value }, 'decayMs')}
						/>
						<SettingSlider
							label="Decay curve"
							value={mapping.envelope.decayCurve}
							min={MIN_ENVELOPE_CURVE}
							max={MAX_ENVELOPE_CURVE}
							step={1}
							suffix="%"
							onchange={(value: number) => handleEnvelopePatch(mapping, { decayCurve: value }, 'decayCurve')}
						/>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</Section>
