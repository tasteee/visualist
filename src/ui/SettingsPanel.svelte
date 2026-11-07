<script lang="ts">
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon'
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon'
	import CrosshairSimpleIcon from 'phosphor-svelte/lib/CrosshairSimpleIcon'
	import { app, nudgeDownbeat, setBpm, setDownbeatAt, setProjectName } from '../store.svelte'
	import ControlSlider from './ControlSlider.svelte'
	import Section from './Section.svelte'
	import './SettingsPanel.css'

	const DOWNBEAT_NUDGE_SECONDS = 0.005

	const downbeatLabel = $derived(`${app.beatOffset.toFixed(3)} s`)
	const canSetDownbeat = $derived(app.hasAudio && !app.isRecording)

	const handleSetDownbeat = () => setDownbeatAt(app.currentTime)
	const handleNudgeEarlier = () => nudgeDownbeat(-DOWNBEAT_NUDGE_SECONDS)
	const handleNudgeLater = () => nudgeDownbeat(DOWNBEAT_NUDGE_SECONDS)

	const handleNameInput = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		setProjectName(detail.value)
	}

	const handleBpmChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: number }>).detail
		setBpm(detail.value)
	}
</script>

<div class="settings-panel">
	<Section title="Project" description="Used for saving and for the name of an export. It never shows in the picture.">
		<z-field label="Project name">
			<z-input value={app.projectName} placeholder="Untitled project" aria-label="Project name" onchange={handleNameInput} oninput={handleNameInput}></z-input>
		</z-field>
	</Section>

	<Section title="Tempo" description="The grid and the beat lines follow this.">
		<div class="settings-tempo">
			<div class="settings-bpm">
				<z-field label="BPM">
					<z-number-input value={app.bpm} min={40} max={240} step={0.1} hasStepperButtons isFullWidth onchange={handleBpmChange}></z-number-input>
				</z-field>
			</div>

			<div class="settings-downbeat">
				<div class="settings-downbeat-text">
					<span class="settings-downbeat-label">Downbeat</span>
					<span class="settings-downbeat-value">{downbeatLabel}</span>
				</div>
				<div class="settings-downbeat-actions">
					<z-tooltip content="5 ms earlier" placement="top" openDelay={300}>
						<button class="settings-downbeat-nudge" type="button" aria-label="Move downbeat 5 ms earlier" disabled={!canSetDownbeat} onclick={handleNudgeEarlier}>
							<CaretLeftIcon weight="bold" />
						</button>
					</z-tooltip>
					<z-tooltip content="5 ms later" placement="top" openDelay={300}>
						<button class="settings-downbeat-nudge" type="button" aria-label="Move downbeat 5 ms later" disabled={!canSetDownbeat} onclick={handleNudgeLater}>
							<CaretRightIcon weight="bold" />
						</button>
					</z-tooltip>
					<z-tooltip content="Park the playhead on a clear bar 1, then click" placement="top" openDelay={300}>
						<z-button size="sm" kind="outline" tone="neutral" isDisabled={!canSetDownbeat} onclick={handleSetDownbeat}>
							<CrosshairSimpleIcon weight="bold" />
							At playhead
						</z-button>
					</z-tooltip>
				</div>
			</div>
		</div>
	</Section>

	<Section title="Response" description="How strongly everything that follows the music reacts.">
		<ControlSlider controlKey="reactivity" label="Reactivity" />
	</Section>
</div>
