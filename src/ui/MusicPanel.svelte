<script lang="ts">
	import WaveformIcon from 'phosphor-svelte/lib/WaveformIcon'
	import { app, detectBpm, formatTime, getAnalysis, setBpm } from '../store.svelte'
	import Section from './Section.svelte'
	import SettingSlider from './SettingSlider.svelte'
	import SettingSwitch from './SettingSwitch.svelte'
	import './MusicPanel.css'

	const bpmLabel = $derived(String(app.bpm))
	const kickLabel = $derived(app.hasAudio ? String(app.kickCount) : '–')
	const lengthLabel = $derived(app.hasAudio ? formatTime(app.duration) : '–')
	const detectedLabel = $derived(`Detected ${getAnalysis().bpm} BPM`)
	const hasDifferentBpm = $derived(app.bpm !== getAnalysis().bpm)

	const handleBpmChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: number }>).detail
		setBpm(detail.value)
	}
</script>

<Section title="Analysis" description={app.hasAudio ? 'Read once when the song loaded.' : 'Showing the built-in demo beat.'}>
	<div class="music-stats">
		<z-stat value={bpmLabel} label="BPM" size="lg"></z-stat>
		<z-stat value={kickLabel} label="Kicks" size="lg"></z-stat>
		<z-stat value={lengthLabel} label="Length" size="lg"></z-stat>
	</div>
</Section>

<Section title="Tempo" description="Echo timing and the beat-locked bounce follow this number live.">
	<div class="music-bpm">
		<z-field label="BPM">
			<z-number-input
				value={app.bpm}
				min={40}
				max={240}
				step={0.1}
				hasStepperButtons
				isFullWidth
				onchange={handleBpmChange}
			></z-number-input>
		</z-field>
		<z-button size="md" kind="outline" tone="neutral" isDisabled={!hasDifferentBpm} onclick={detectBpm}>
			<WaveformIcon weight="bold" />
			Detect
		</z-button>
	</div>
	<p class="music-detected">{detectedLabel}</p>
</Section>

<Section title="Response">
	<SettingSlider
		label="Reactivity"
		hint="How strongly the visuals respond to the audio. At 0 nothing moves."
		value={app.settings.reactivity}
		min={0}
		max={2}
		step={0.05}
		onchange={(value) => (app.settings.reactivity = value)}
	/>
	<SettingSwitch
		label="Bounce on the BPM beat"
		description="Lock the logo's bounce to the beat grid."
		hint="On: the bounce lands on every beat of the BPM grid, 60% beat and 40% audio. Off: audio only."
		isChecked={app.settings.isBeatBounceOn}
		onchange={(isChecked) => (app.settings.isBeatBounceOn = isChecked)}
	/>
</Section>
