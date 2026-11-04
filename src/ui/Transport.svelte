<script lang="ts">
	import PauseIcon from 'phosphor-svelte/lib/PauseIcon'
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon'
	import MusicNotesIcon from 'phosphor-svelte/lib/MusicNotesIcon'
	import { app, formatTime, togglePlay } from '../store.svelte'
	import { openAudioPicker } from './filePicker'
	import Timeline from './Timeline.svelte'
	import './Transport.css'

	const canPlay = $derived(app.hasAudio && !app.isRecording && !app.isAnalyzing)
	const canChange = $derived(!app.isRecording && !app.isAnalyzing)
	const playLabel = $derived(app.isPlaying ? 'Pause' : 'Play')
	const elapsedLabel = $derived(app.hasAudio ? formatTime(app.currentTime) : '0:00')
	const totalLabel = $derived(app.hasAudio ? formatTime(app.duration) : '0:00')
</script>

<div class="transport">
	<z-tooltip content={playLabel} placement="top">
		<z-button size="lg" kind="solid" tone="neutral" isDisabled={!canPlay} onclick={togglePlay} aria-label={playLabel}>
			{#if app.isPlaying}
				<PauseIcon weight="fill" />
			{:else}
				<PlayIcon weight="fill" />
			{/if}
		</z-button>
	</z-tooltip>

	<div class="transport-time">
		<span class="transport-elapsed">{elapsedLabel}</span>
		<span class="transport-total">/ {totalLabel}</span>
	</div>

	<Timeline />

	<div class="transport-hints">
		<z-button size="md" kind="outline" tone="neutral" isDisabled={!canChange} onclick={openAudioPicker}>
			<MusicNotesIcon weight="bold" />
			Change song
		</z-button>
		<z-kbd>Space</z-kbd>
	</div>
</div>
