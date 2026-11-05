<script lang="ts">
	import { getRowColor } from '../appearance.svelte'
	import { BAND_OUTPUT_OPTIONS, BAND_PRESETS, formatBandRange } from '../engine/bands'
	import type { BandRangeT } from '../engine/bands'
	import { MAX_BAND_RELEASE, MIN_BAND_RELEASE, getBandSourceId } from '../engine/sources'
	import type { BandOutputT, BandSourceT } from '../engine/types'
	import { applyBandPreset, removeBand, renameBand, setBandOutput, setBandRange, setBandRelease, setBandSensitivity } from '../sources.svelte'
	import { getDetectedAnalysis, getLiveSignals } from '../store.svelte'
	import Segmented from './Segmented.svelte'
	import SettingSlider from './SettingSlider.svelte'
	import SourceCard from './SourceCard.svelte'
	import SpectrumPicker from './SpectrumPicker.svelte'

	type BandCardPropsT = {
		band: BandSourceT
	}

	const props: BandCardPropsT = $props()

	const PRESET_OPTIONS = BAND_PRESETS.map((preset) => ({ value: preset.value, label: preset.label }))

	let presetKey = $state(0)

	const spectrum = $derived(getDetectedAnalysis().spectrum)
	const bandColor = $derived(getRowColor(props.band.id, 'amber'))
	const sourceId = $derived(getBandSourceId(props.band.id))
	const liveLevel = $derived(getLiveSignals()[sourceId] ?? 0)
	const isHits = $derived(props.band.output === 'hits')
	const rangeLabel = $derived(formatBandRange(props.band))
	const outputLabel = $derived(isHits ? 'Hits' : 'Level')
	const metaLabel = $derived(`${rangeLabel} · ${outputLabel}`)
	const releaseLabel = $derived(isHits ? 'Fade' : 'Release')
	const releaseHint = $derived(isHits ? 'How long each hit keeps pushing.' : 'How slowly the level falls back.')

	const handleRename = (name: string) => renameBand(props.band.id, name)

	const handleRemove = () => removeBand(props.band.id)

	const handleRangeChange = (range: BandRangeT) => setBandRange(props.band.id, range)

	// The preset menu is a one-shot picker, so it resets after
	// each choice.
	const handlePresetChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		applyBandPreset(props.band.id, detail.value)
		presetKey += 1
	}

	const handleOutputChange = (value: string) => setBandOutput(props.band.id, value as BandOutputT)

	const handleReleaseChange = (value: number) => setBandRelease(props.band.id, value)

	const handleSensitivityChange = (value: number) => setBandSensitivity(props.band.id, value)
</script>

<SourceCard color={bandColor} isBand name={props.band.name} meta={metaLabel} level={liveLevel} removeLabel="Remove band" onrename={handleRename} onremove={handleRemove}>
	<SpectrumPicker {spectrum} lowHz={props.band.lowHz} highHz={props.band.highHz} label={props.band.name} onchange={handleRangeChange} />
	{#key presetKey}
		<z-select size="sm" value="" placeholder="Jump to a preset" options={PRESET_OPTIONS} aria-label="Band preset" onchange={handlePresetChange}></z-select>
	{/key}
	<Segmented label="Output" options={BAND_OUTPUT_OPTIONS} value={props.band.output} onchange={handleOutputChange} />
	<SettingSlider label={releaseLabel} hint={releaseHint} value={props.band.release} min={MIN_BAND_RELEASE} max={MAX_BAND_RELEASE} step={0.01} suffix=" s" onchange={handleReleaseChange} />
	{#if isHits}
		<SettingSlider label="Sensitivity" hint="Higher catches quieter hits." value={props.band.sensitivity} min={0} max={1} step={0.01} onchange={handleSensitivityChange} />
	{/if}
</SourceCard>
