<script lang="ts">
	import RecordIcon from 'phosphor-svelte/lib/RecordIcon'
	import { app, cancelRecording, formatTime, getClipLength, startRecording } from '../store.svelte'
	import { getFormatPreset, getSizeForShortSide } from '../engine/formats'
	import { MAX_FADE_SECONDS, TAIL_SECONDS } from '../engine/settings'
	import type { AspectRatioT, FadeSettingNameT, FrameRateT, ResolutionT } from '../engine/types'
	import FormatPicker from './FormatPicker.svelte'
	import Section from './Section.svelte'
	import Segmented from './Segmented.svelte'
	import './ExportPanel.css'

	const getResolutionLabel = (aspectRatio: AspectRatioT, shortSide: number): string => {
		const size = getSizeForShortSide(aspectRatio, shortSide)
		return `${size.width} × ${size.height}`
	}

	const FRAME_RATE_OPTIONS = [
		{ value: '30', label: '30 fps' },
		{ value: '60', label: '60 fps' }
	]

	const resolutionOptions = $derived([
		{ value: '1080', label: getResolutionLabel(app.settings.aspectRatio, 1080) },
		{ value: '720', label: getResolutionLabel(app.settings.aspectRatio, 720) }
	])
	const formatPreset = $derived(getFormatPreset(app.settings.aspectRatio))
	const formatDescription = $derived(`${formatPreset.value} for ${formatPreset.platforms}. Locked while recording.`)
	const outputSizeLabel = $derived(getResolutionLabel(app.settings.aspectRatio, Number(app.settings.resolution)))
	const canRecord = $derived(app.hasAudio && app.isLayersReady && !app.isAnalyzing)
	const lengthLabel = $derived(app.hasAudio ? formatTime(getClipLength() + TAIL_SECONDS) : '–')
	const rangeLabel = $derived(app.hasAudio ? `${formatTime(app.trimStart)} – ${formatTime(app.trimEnd)}` : '–')
	const formatLabel = $derived(app.recorderLabel === '' ? 'Checking…' : app.recorderLabel)
	const realTimeNote = $derived(
		app.hasAudio
			? `Recording runs in real time, so it takes about ${formatTime(getClipLength() + TAIL_SECONDS)}.`
			: 'Load a song to record. Recording runs in real time.'
	)

	const handleFormat = (value: AspectRatioT) => {
		if (app.isRecording) return
		app.settings.aspectRatio = value
	}

	const handleResolution = (value: string) => {
		if (app.isRecording) return
		app.settings.resolution = value as ResolutionT
	}

	const handleFrameRate = (value: string) => {
		if (app.isRecording) return
		app.settings.frameRate = Number(value) as FrameRateT
	}

	const handleFadeChange = (name: FadeSettingNameT, event: Event) => {
		const detail = (event as CustomEvent<{ value: number }>).detail
		const isNumber = Number.isFinite(detail.value)
		if (!isNumber) return
		app.settings[name] = Math.min(MAX_FADE_SECONDS, Math.max(0, detail.value))
	}

	const handleRecord = () => {
		if (app.isRecording) return cancelRecording()
		void startRecording()
	}
</script>

<Section title="Format" description={formatDescription}>
	<FormatPicker value={app.settings.aspectRatio} isDisabled={app.isRecording} onchange={handleFormat} />
</Section>

<Section title="Resolution" description="Locked while recording.">
	<Segmented label="Resolution" options={resolutionOptions} value={app.settings.resolution} isDisabled={app.isRecording} onchange={handleResolution} />
</Section>

<Section title="Frame rate" description="60 fps is best effort on slower machines.">
	<Segmented label="Frame rate" options={FRAME_RATE_OPTIONS} value={String(app.settings.frameRate)} isDisabled={app.isRecording} onchange={handleFrameRate} />
</Section>

<Section title="Audio fade" description="Seconds. Applies to the exported sound.">
	<div class="export-pair">
		<z-field label="Fade in">
			<z-number-input value={app.settings.audioFadeIn} min={0} max={MAX_FADE_SECONDS} step={0.1} isFullWidth isDisabled={app.isRecording} onchange={(event: Event) => handleFadeChange('audioFadeIn', event)}></z-number-input>
		</z-field>
		<z-field label="Fade out">
			<z-number-input value={app.settings.audioFadeOut} min={0} max={MAX_FADE_SECONDS} step={0.1} isFullWidth isDisabled={app.isRecording} onchange={(event: Event) => handleFadeChange('audioFadeOut', event)}></z-number-input>
		</z-field>
	</div>
</Section>

<Section title="Video fade" description="Seconds. Fades the picture to the background color.">
	<div class="export-pair">
		<z-field label="Fade in">
			<z-number-input value={app.settings.videoFadeIn} min={0} max={MAX_FADE_SECONDS} step={0.1} isFullWidth isDisabled={app.isRecording} onchange={(event: Event) => handleFadeChange('videoFadeIn', event)}></z-number-input>
		</z-field>
		<z-field label="Fade out">
			<z-number-input value={app.settings.videoFadeOut} min={0} max={MAX_FADE_SECONDS} step={0.1} isFullWidth isDisabled={app.isRecording} onchange={(event: Event) => handleFadeChange('videoFadeOut', event)}></z-number-input>
		</z-field>
	</div>
</Section>

<Section title="File">
	<dl class="export-facts">
		<div class="export-fact"><dt>Format</dt><dd>{formatLabel}</dd></div>
		<div class="export-fact"><dt>Size</dt><dd>{outputSizeLabel} · {formatPreset.value}</dd></div>
		<div class="export-fact"><dt>Bitrate</dt><dd>16 Mbps video · 256 kbps audio</dd></div>
		<div class="export-fact"><dt>Range</dt><dd>{rangeLabel}</dd></div>
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
