<script lang="ts">
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon'
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon'
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon'
	import CrosshairSimpleIcon from 'phosphor-svelte/lib/CrosshairSimpleIcon'
	import {
		app,
		nudgeDownbeat,
		resetDownbeat,
		setBpm,
		setDownbeatAt,
		setProjectDuration,
		setProjectName
	} from '../store.svelte'
	import ControlSlider from './ControlSlider.svelte'
	import Section from './Section.svelte'
	import './SettingsPanel.css'

	const DOWNBEAT_NUDGE_SECONDS = 0.005

	const downbeatLabel = $derived(`${app.beatOffset.toFixed(3)} s`)
	const canSetDownbeat = $derived(app.hasAudio && !app.isRecording)

	const handleSetDownbeat = () => setDownbeatAt(app.currentTime)
	const handleResetDownbeat = () => resetDownbeat()
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

	const handleDurationChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: number }>).detail
		setProjectDuration(detail.value)
	}
</script>

<Section title="Project">
	<z-field label="Name" is-horizontal>
		<z-input
			value={app.projectName}
			placeholder="untitled-project"
			aria-label="Project Name"
			onchange={handleNameInput}
			oninput={handleNameInput}
		></z-input>
	</z-field>
	<z-field label="Duration" is-horizontal>
		<z-number-input
			value={app.projectDuration}
			min={5}
			max={3600}
			step={5}
			hasStepperButtons
			aria-label="Project duration in seconds"
			oninput={handleDurationChange}
			onchange={handleDurationChange}
		></z-number-input>
	</z-field>
</Section>

<Section title="Tempo">
	<div class="settings-tempo">
		<z-field label="BPM" is-horizontal>
			<z-number-input
				value={app.bpm}
				min={40}
				max={240}
				step={0.1}
				hasStepperButtons
				oninput={handleBpmChange}
				onchange={handleBpmChange}
			></z-number-input>
		</z-field>

		<div class="settings-downbeat">
			<div class="settings-downbeat-text">
				<span class="settings-downbeat-label">Downbeat</span>
				<span class="settings-downbeat-value">{downbeatLabel}</span>
			</div>
			<div class="settings-downbeat-actions">
				{#if app.beatOffset !== 0}
					<z-tooltip content="Reset downbeat to 0.000 s" placement="top" openDelay={300}>
						<z-button
							isIcon
							size="sm"
							kind="ghost"
							tone="neutral"
							aria-label="Reset downbeat to 0.000 s"
							onclick={handleResetDownbeat}
						>
							<ArrowCounterClockwiseIcon weight="bold" />
						</z-button>
					</z-tooltip>
				{/if}
				<z-tooltip content="5 ms earlier" placement="top" openDelay={300}>
					<z-button
						isIcon
						size="sm"
						kind="outline"
						tone="neutral"
						aria-label="Move downbeat 5 ms earlier"
						isDisabled={!canSetDownbeat}
						onclick={handleNudgeEarlier}
					>
						<CaretLeftIcon weight="bold" />
					</z-button>
				</z-tooltip>
				<z-tooltip content="5 ms later" placement="top" openDelay={300}>
					<z-button
						isIcon
						size="sm"
						kind="outline"
						tone="neutral"
						aria-label="Move downbeat 5 ms later"
						isDisabled={!canSetDownbeat}
						onclick={handleNudgeLater}
					>
						<CaretRightIcon weight="bold" />
					</z-button>
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

<Section title="Response">
	<ControlSlider controlKey="reactivity" label="Reactivity" />
</Section>
