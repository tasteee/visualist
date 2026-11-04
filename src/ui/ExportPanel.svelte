<script lang="ts">
	import RecordIcon from 'phosphor-svelte/lib/RecordIcon'
	import { app, cancelRecording, formatTime, startRecording } from '../store.svelte'
	import { TAIL_SECONDS } from '../engine/settings'
	import type { FrameRateT, ResolutionT } from '../engine/types'
	import Section from './Section.svelte'
	import Segmented from './Segmented.svelte'
	import './ExportPanel.css'

	const RESOLUTION_OPTIONS = [
		{ value: '1080', label: '1920 × 1080' },
		{ value: '720', label: '1280 × 720' }
	]

	const FRAME_RATE_OPTIONS = [
		{ value: '30', label: '30 fps' },
		{ value: '60', label: '60 fps' }
	]

	const canRecord = $derived(app.hasAudio && app.isLayersReady && !app.isAnalyzing)
	const lengthLabel = $derived(app.hasAudio ? formatTime(app.duration + TAIL_SECONDS) : '–')
	const formatLabel = $derived(app.recorderLabel === '' ? 'Checking…' : app.recorderLabel)
	const realTimeNote = $derived(
		app.hasAudio
			? `Recording runs in real time, so it takes about ${formatTime(app.duration + TAIL_SECONDS)}.`
			: 'Load a song to record. Recording runs in real time.'
	)

	const handleResolution = (value: string) => {
		if (app.isRecording) return
		app.settings.resolution = value as ResolutionT
	}

	const handleFrameRate = (value: string) => {
		if (app.isRecording) return
		app.settings.frameRate = Number(value) as FrameRateT
	}

	const handleRecord = () => {
		if (app.isRecording) return cancelRecording()
		void startRecording()
	}
</script>

<Section title="Resolution" description="16:9. Locked while recording.">
	<Segmented label="Resolution" options={RESOLUTION_OPTIONS} value={app.settings.resolution} isDisabled={app.isRecording} onchange={handleResolution} />
</Section>

<Section title="Frame rate" description="60 fps is best effort on slower machines.">
	<Segmented label="Frame rate" options={FRAME_RATE_OPTIONS} value={String(app.settings.frameRate)} isDisabled={app.isRecording} onchange={handleFrameRate} />
</Section>

<Section title="File">
	<dl class="export-facts">
		<div class="export-fact"><dt>Format</dt><dd>{formatLabel}</dd></div>
		<div class="export-fact"><dt>Bitrate</dt><dd>16 Mbps video · 256 kbps audio</dd></div>
		<div class="export-fact"><dt>Length</dt><dd>{lengthLabel}</dd></div>
		<div class="export-fact"><dt>Name</dt><dd>{app.hasAudio ? `${app.fileName.replace(/\.[^.]+$/, '')}-visualizer` : '–'}</dd></div>
	</dl>
</Section>

<Section title="Record">
	<z-button
		size="lg"
		kind={app.isRecording ? 'outline' : 'solid'}
		tone={app.isRecording ? 'danger' : 'primary'}
		isFullWidth
		isDisabled={!canRecord && !app.isRecording}
		onclick={handleRecord}
	>
		<RecordIcon weight="fill" />
		{app.isRecording ? 'Cancel recording' : 'Record video'}
	</z-button>
	<p class="export-note">{realTimeNote} Keep this tab in the foreground until it finishes, and the file downloads on its own.</p>
</Section>
