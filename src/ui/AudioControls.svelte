<script lang="ts">
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon'
	import { formatBpm } from '../engine/timeline'
	import { findLayer, removeLayer } from '../layers.svelte'
	import { app, detectLayerBpm, getKnownLayerBpm, setBpm } from '../store.svelte'
	import LayerParamSlider from './LayerParamSlider.svelte'
	import './AudioControls.css'

	// Settings for one audio layer. Its tempo is found when asked, and
	// the project only takes it when the user says so.
	type AudioControlsPropsT = {
		layerId: string
	}

	const props: AudioControlsPropsT = $props()

	let foundBpm = $state<number | null>(null)
	let isDetecting = $state(false)
	let progress = $state(0)

	// A layer that was analyzed before already knows its tempo.
	$effect(() => {
		foundBpm = getKnownLayerBpm(props.layerId)
	})

	const layer = $derived(findLayer(props.layerId))
	const hasBpm = $derived(foundBpm !== null)
	const bpmLabel = $derived(foundBpm === null ? '' : formatBpm(foundBpm))
	const isApplied = $derived(foundBpm !== null && Math.abs(foundBpm - app.bpm) < 0.05)
	const detectLabel = $derived(isDetecting ? `Listening… ${Math.round(progress * 100)}%` : hasBpm ? 'Detect again' : 'Detect BPM')
	const applyLabel = $derived(isApplied ? 'Already used by the project' : `Use ${bpmLabel} BPM for the project`)

	const handleDetect = async () => {
		if (isDetecting) return
		isDetecting = true
		progress = 0
		foundBpm = await detectLayerBpm(props.layerId, (fraction) => (progress = fraction))
		isDetecting = false
	}

	const handleApply = () => {
		if (foundBpm !== null) setBpm(foundBpm)
	}

	const handleRemove = () => removeLayer(props.layerId)
</script>

{#if layer !== undefined}
	<LayerParamSlider {layer} paramKey="volume" />
{/if}

<div class="audio-controls-tempo">
	<z-button size="sm" kind="outline" tone="neutral" isDisabled={isDetecting} onclick={handleDetect}>{detectLabel}</z-button>
	{#if hasBpm}
		<p class="audio-controls-note">Detected tempo: <strong>{bpmLabel} BPM</strong>. The project is at {formatBpm(app.bpm)} BPM.</p>
		<z-button size="sm" kind="outline" tone="neutral" isDisabled={isApplied} onclick={handleApply}>{applyLabel}</z-button>
	{/if}
</div>

<z-button size="sm" kind="outline" tone="danger" isFullWidth onclick={handleRemove}>
	<TrashIcon weight="bold" />
	Remove audio
</z-button>
