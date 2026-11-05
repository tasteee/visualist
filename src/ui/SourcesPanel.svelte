<script lang="ts">
	import FileArrowUpIcon from 'phosphor-svelte/lib/FileArrowUpIcon'
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon'
	import WaveformIcon from 'phosphor-svelte/lib/WaveformIcon'
	import { BAND_PRESETS } from '../engine/bands'
	import { openMidiFile } from '../midiImport.svelte'
	import { addBand, addEmptyTrack, addTrackFromDetected, sources } from '../sources.svelte'
	import { app } from '../store.svelte'
	import BandCard from './BandCard.svelte'
	import HitTrackCard from './HitTrackCard.svelte'
	import Section from './Section.svelte'
	import { openMidiPicker } from './filePicker'
	import './SourcesPanel.css'

	const PRESET_OPTIONS = BAND_PRESETS.map((preset) => ({ value: preset.value, label: preset.label }))

	const HITS_DESCRIPTION = 'Hits you place by hand, for exact sync. Edit them in the Sync lanes. A track can drive Kick or Snare, so echoes and glitches follow it too.'
	const BANDS_DESCRIPTION = 'Follow any slice of the spectrum. Start from a preset, then drag the range over the song’s spectrum.'

	let addBandKey = $state(0)

	const canEditHits = $derived(app.hasAudio && !app.isAnalyzing && !app.isRecording)
	const hasTracks = $derived(sources.tracks.length > 0)
	const hasBands = $derived(sources.bands.length > 0)
	const tracksEmptyText = $derived(app.hasAudio ? 'No hit tracks yet.' : 'Load a song to add hit tracks.')

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

<Section title="Hit tracks" description={HITS_DESCRIPTION}>
	<div class="sources-panel-actions">
		<z-button size="sm" kind="outline" tone="neutral" isDisabled={!canEditHits} onclick={handleFromKicks}>
			<WaveformIcon weight="bold" />
			From kicks
		</z-button>
		<z-button size="sm" kind="outline" tone="neutral" isDisabled={!canEditHits} onclick={handleFromSnares}>
			<WaveformIcon weight="bold" />
			From snares
		</z-button>
		<z-button size="sm" kind="outline" tone="neutral" isDisabled={!canEditHits} onclick={handleImportMidi}>
			<FileArrowUpIcon weight="bold" />
			Import MIDI
		</z-button>
		<z-button size="sm" kind="outline" tone="neutral" isDisabled={!canEditHits} onclick={handleEmptyTrack}>
			<PlusIcon weight="bold" />
			Empty track
		</z-button>
	</div>

	{#each sources.tracks as track (track.id)}
		<HitTrackCard {track} />
	{/each}
	{#if !hasTracks}
		<p class="sources-panel-empty">{tracksEmptyText} Detected hits are a quick start: fix the misses in the timeline. Or drop a MIDI file anywhere.</p>
	{/if}
</Section>

<Section title="Frequency bands" description={BANDS_DESCRIPTION}>
	{#key addBandKey}
		<z-select value="" placeholder="Add a band" options={PRESET_OPTIONS} aria-label="Add a band" onchange={handleAddBand}></z-select>
	{/key}

	{#each sources.bands as band (band.id)}
		<BandCard {band} />
	{/each}
	{#if !hasBands}
		<p class="sources-panel-empty">No bands yet. Each band becomes a source in every Follow menu.</p>
	{/if}
</Section>
