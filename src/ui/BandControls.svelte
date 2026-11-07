<script lang="ts">
	import { BAND_OUTPUT_OPTIONS, BAND_PRESETS } from '../engine/bands'
	import type { BandRangeT } from '../engine/bands'
	import { MAX_BAND_RELEASE, MIN_BAND_RELEASE } from '../engine/sources'
	import type { BandOutputT, BandSourceT } from '../engine/types'
	import { applyBandPreset, setBandOutput, setBandRange, setBandRelease, setBandSensitivity } from '../sources.svelte'
	import { getDetectedAnalysis } from '../store.svelte'
	import Segmented from './Segmented.svelte'
	import SettingSlider from './SettingSlider.svelte'
	import SpectrumPicker from './SpectrumPicker.svelte'

	// What a band lane owns besides its name and color: the
	// frequency range it listens to, and how it responds.
	type BandControlsPropsT = {
		band: BandSourceT
	}

	const props: BandControlsPropsT = $props()

	const PRESET_OPTIONS = BAND_PRESETS.map((preset) => ({ value: preset.value, label: preset.label }))

	let presetKey = $state(0)

	const spectrum = $derived(getDetectedAnalysis().spectrum)
	const isImpulses = $derived(props.band.output === 'impulses')
	const releaseLabel = $derived(isImpulses ? 'Fade' : 'Release')
	const releaseHint = $derived(isImpulses ? 'How long each impulse keeps pushing.' : 'How slowly the level falls back.')

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

<SpectrumPicker {spectrum} lowHz={props.band.lowHz} highHz={props.band.highHz} label={props.band.name} onchange={handleRangeChange} />
{#key presetKey}
	<z-select size="sm" value="" placeholder="Jump to a preset" options={PRESET_OPTIONS} aria-label="Band preset" onchange={handlePresetChange}></z-select>
{/key}
<Segmented label="Output" options={BAND_OUTPUT_OPTIONS} value={props.band.output} onchange={handleOutputChange} />
<SettingSlider label={releaseLabel} hint={releaseHint} value={props.band.release} min={MIN_BAND_RELEASE} max={MAX_BAND_RELEASE} step={0.01} suffix=" s" onchange={handleReleaseChange} />
{#if isImpulses}
	<SettingSlider label="Sensitivity" hint="Higher catches quieter impulses." value={props.band.sensitivity} min={0} max={1} step={0.01} onchange={handleSensitivityChange} />
{/if}
