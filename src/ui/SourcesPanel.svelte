<script lang="ts">
	import FileArrowUpIcon from 'phosphor-svelte/lib/FileArrowUpIcon'
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon'
	import WaveformIcon from 'phosphor-svelte/lib/WaveformIcon'
	import { BAND_PRESETS } from '../engine/bands'
	import { openMidiFile } from '../midiImport.svelte'
	import { addBand, addEmptyTrack, addTrackFromDetected, sources } from '../sources.svelte'
	import { app } from '../store.svelte'
	import Section from './Section.svelte'
	import { openMidiPicker } from './filePicker'
	import './SourcesPanel.css'

	const PRESET_OPTIONS = BAND_PRESETS.map((preset) => ({ value: preset.value, label: preset.label }))

	const IMPULSES_DESCRIPTION = 'Impulses you place by hand, for exact sync. They live under the audio layer in the timeline. Right-click a track’s header, or press its gear, to rename it or give it a role like Kick or Snare.'
	const BANDS_DESCRIPTION = 'Follow any slice of the spectrum. Pick a preset, then open the band’s gear in the timeline to drag its range over the song’s spectrum.'

	let addBandKey = $state(0)

	const canEditImpulses = $derived(app.hasAudio && !app.isAnalyzing && !app.isRecording)
	const hasTracks = $derived(sources.tracks.length > 0)
	const hasBands = $derived(sources.bands.length > 0)
	const tracksEmptyText = $derived(app.hasAudio ? 'No impulse tracks yet.' : 'Load a song to add impulse tracks.')

	const handleFromKicks = () => addTrackFromDetected('kick')

	const handleFromSnares = () => addTrackFromDetected('snare')

	const handleEmptyTrack = () => addEmptyTrack()

	const handleImportMidi = () => openMidiPicker((file) => void openMidiFile(file))

	// The add menu is a one-shot picker, so it resets after
	// each choice.
	const handleAddBand = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		addBand(detail.value)
		addBandKey += 1
	}
</script>

<Section title="Impulse tracks" description={IMPULSES_DESCRIPTION}>
	<div class="sources-panel-actions">
		<z-button size="sm" kind="outline" tone="neutral" isDisabled={!canEditImpulses} onclick={handleFromKicks}>
			<WaveformIcon weight="bold" />
			From kicks
		</z-button>
		<z-button size="sm" kind="outline" tone="neutral" isDisabled={!canEditImpulses} onclick={handleFromSnares}>
			<WaveformIcon weight="bold" />
			From snares
		</z-button>
		<z-button size="sm" kind="outline" tone="neutral" isDisabled={!canEditImpulses} onclick={handleImportMidi}>
			<FileArrowUpIcon weight="bold" />
			Import MIDI
		</z-button>
		<z-button size="sm" kind="outline" tone="neutral" isDisabled={!canEditImpulses} onclick={handleEmptyTrack}>
			<PlusIcon weight="bold" />
			Empty track
		</z-button>
	</div>

	{#if !hasTracks}
		<p class="sources-panel-empty">{tracksEmptyText} Detected impulses are a quick start: fix the misses in the timeline. Or drop a MIDI file anywhere.</p>
	{/if}
</Section>

<Section title="Frequency bands" description={BANDS_DESCRIPTION}>
	{#key addBandKey}
		<z-select value="" placeholder="Add a band" options={PRESET_OPTIONS} aria-label="Add a band" onchange={handleAddBand}></z-select>
	{/key}

	{#if !hasBands}
		<p class="sources-panel-empty">No bands yet. Each band becomes a source in every Follow menu.</p>
	{/if}
</Section>
