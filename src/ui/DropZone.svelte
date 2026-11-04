<script lang="ts">
	import UploadSimpleIcon from 'phosphor-svelte/lib/UploadSimpleIcon'
	import { app } from '../store.svelte'
	import { openAudioPicker } from './filePicker'
	import './DropZone.css'

	const canChoose = $derived(!app.isAnalyzing)
</script>

<div class="dropzone">
	<div class="dropzone-icon"><UploadSimpleIcon weight="bold" /></div>
	<div class="dropzone-text">
		<span class="dropzone-title">Drop a song anywhere</span>
		<span class="dropzone-hint">WAV, MP3, M4A, OGG or FLAC. A video file works too.</span>
	</div>
	<z-button size="md" kind="solid" tone="primary" isDisabled={!canChoose} onclick={openAudioPicker}>Choose file</z-button>
</div>
