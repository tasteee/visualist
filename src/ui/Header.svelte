<script lang="ts">
	import MusicNotesIcon from 'phosphor-svelte/lib/MusicNotesIcon'
	import RecordIcon from 'phosphor-svelte/lib/RecordIcon'
	import XIcon from 'phosphor-svelte/lib/XIcon'
	import { app, cancelRecording, formatTime, startRecording } from '../store.svelte'
	import { openAudioPicker } from './filePicker'
	import './Header.css'

	const canRecord = $derived(app.hasAudio && app.isLayersReady && !app.isAnalyzing)
	const canLoad = $derived(!app.isRecording && !app.isAnalyzing)
	const fileLabel = $derived(app.hasAudio ? app.fileName : 'No song loaded')
	const fileMeta = $derived(app.hasAudio ? `${formatTime(app.duration)} · ${app.bpm} BPM` : 'Previewing the demo beat')
	const recordLabel = $derived(app.isRecording ? 'Cancel recording' : 'Record video')
	const percentLabel = $derived(`${Math.round(app.recordProgress * 100)}%`)

	const handleRecordClick = () => {
		if (app.isRecording) return cancelRecording()
		void startRecording()
	}
</script>

<header class="app-header">
	<div class="header-brand">
		<span class="header-wordmark">vink</span>
		<span class="header-tagline">tasteink visualizer</span>
	</div>

	<button class="header-file" type="button" disabled={!canLoad} onclick={openAudioPicker} aria-label="Choose a song">
		<span class="header-file-icon"><MusicNotesIcon weight="bold" /></span>
		<span class="header-file-text">
			<span class="header-file-name">{fileLabel}</span>
			<span class="header-file-meta">{fileMeta}</span>
		</span>
	</button>

	<div class="header-actions">
		{#if app.isRecording}
			<z-badge tone="danger" isDot>Recording {percentLabel}</z-badge>
		{/if}
		<z-button size="md" kind="outline" tone="neutral" isDisabled={!canLoad} onclick={openAudioPicker}>
			<MusicNotesIcon weight="bold" />
			{app.hasAudio ? 'Change song' : 'Load song'}
		</z-button>
		<z-button
			size="md"
			kind={app.isRecording ? 'outline' : 'solid'}
			tone={app.isRecording ? 'danger' : 'primary'}
			isDisabled={!canRecord && !app.isRecording}
			onclick={handleRecordClick}
		>
			{#if app.isRecording}
				<XIcon weight="bold" />
			{:else}
				<RecordIcon weight="fill" />
			{/if}
			{recordLabel}
		</z-button>
	</div>
</header>
