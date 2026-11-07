<script lang="ts">
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon'
	import { formatBpm } from '../engine/timeline'
	import { findLayer, removeLayer } from '../layers.svelte'
	import { app, detectLayerBpm, getDetectedAnalysis, removeSong, setBpm } from '../store.svelte'
	import LayerParamSlider from './LayerParamSlider.svelte'

	// Settings for audio. With no layer id it is the song itself,
	// whose tempo was found when it loaded. Otherwise it is an audio
	// layer, which finds its tempo when asked.
	type AudioControlsPropsT = {
		layerId: string | null
	}

	const props: AudioControlsPropsT = $props()

	let foundBpm = $state<number | null>(null)
	let isDetecting = $state(false)
	let progress = $state(0)

	const layer = $derived(props.layerId === null ? undefined : findLayer(props.layerId))
	const isSong = $derived(props.layerId === null)
	const shownBpm = $derived(isSong ? getDetectedAnalysis().bpm : foundBpm)
	const hasBpm = $derived(shownBpm !== null)
	const bpmLabel = $derived(shownBpm === null ? '' : formatBpm(shownBpm))
	const isApplied = $derived(shownBpm !== null && Math.abs(shownBpm - app.bpm) < 0.05)
	const detectLabel = $derived(isDetecting ? `Listening… ${Math.round(progress * 100)}%` : 'Detect BPM')

	const handleDetect = async () => {
		if (props.layerId === null || isDetecting) return
		isDetecting = true
		progress = 0
		foundBpm = await detectLayerBpm(props.layerId, (fraction) => (progress = fraction))
		isDetecting = false
	}

	const handleApply = () => {
		if (shownBpm !== null) setBpm(shownBpm)
	}

	const handleRemove = () => {
		if (props.layerId === null) return void removeSong()
		removeLayer(props.layerId)
	}
</script>

{#if layer !== undefined}
	<LayerParamSlider {layer} paramKey="volume" />
{/if}

<div class="audio-controls-tempo">
	{#if !isSong}
		<z-button size="sm" kind="outline" tone="neutral" isDisabled={isDetecting} onclick={handleDetect}>{detectLabel}</z-button>
	{/if}
	{#if hasBpm}
		<p class="audio-controls-note">Detected tempo: <strong>{bpmLabel} BPM</strong>. The project is at {formatBpm(app.bpm)} BPM.</p>
		<z-button size="sm" kind="outline" tone="neutral" isDisabled={isApplied} onclick={handleApply}>
			{isApplied ? 'Already used by the project' : 'Use for the project'}
		</z-button>
	{/if}
</div>

<z-button size="sm" kind="outline" tone="danger" isFullWidth onclick={handleRemove}>
	<TrashIcon weight="bold" />
	{isSong ? 'Remove the song' : 'Remove audio'}
</z-button>
