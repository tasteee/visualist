<script lang="ts">
	import WaveformIcon from 'phosphor-svelte/lib/WaveformIcon'
	import { app, detectBpm, setBpm, setTheme, setTitle } from '../store.svelte'
	import { getAnalysis } from '../store.svelte'
	import type { EchoStyleNameT, ModeT } from '../engine/types'
	import ColorRow from './ColorRow.svelte'
	import Section from './Section.svelte'
	import Segmented from './Segmented.svelte'
	import SettingSlider from './SettingSlider.svelte'
	import SettingSwitch from './SettingSwitch.svelte'
	import './SettingsPanel.css'

	type StyleChipT = {
		name: EchoStyleNameT
		label: string
	}

	const THEME_OPTIONS = [
		{ value: 'light', label: 'Light Theme' },
		{ value: 'dark', label: 'Dark Theme' }
	]

	const STYLE_CHIPS: StyleChipT[] = [
		{ name: 'hollow', label: 'Hollow' },
		{ name: 'faintFill', label: 'Faint fill' },
		{ name: 'double', label: 'Double' },
		{ name: 'sliced', label: 'Sliced' },
		{ name: 'gritty', label: 'Gritty' }
	]

	const hasDifferentBpm = $derived(app.bpm !== Math.round(getAnalysis().bpm))

	const checkIsStyleAvailable = (name: EchoStyleNameT): boolean => {
		const isEchoOn = app.settings.isEchoesOn
		const isBlockedByGlitch = name === 'sliced' && !app.settings.isGlitchOn
		const isBlockedByTexture = name === 'gritty' && !app.settings.isTextureOn
		return isEchoOn && !isBlockedByGlitch && !isBlockedByTexture
	}

	const handleTitleInput = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		setTitle(detail.value)
	}

	const handleBpmChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: number }>).detail
		setBpm(detail.value)
	}

	const handleStyleSelect = (name: EchoStyleNameT, event: Event) => {
		const detail = (event as CustomEvent<{ selected: boolean }>).detail
		app.settings.echoStyles[name] = detail.selected
	}
</script>

<Section title="General">
	<z-field label="Track title">
		<z-input value={app.title} placeholder="Untitled track" onchange={handleTitleInput} oninput={handleTitleInput}></z-input>
	</z-field>
	<div class="settings-bpm">
		<z-field label="BPM">
			<z-number-input value={app.bpm} min={40} max={240} step={1} hasStepperButtons isFullWidth onchange={handleBpmChange}></z-number-input>
		</z-field>
		<z-button size="md" kind="outline" tone="neutral" isDisabled={!hasDifferentBpm} onclick={detectBpm}>
			<WaveformIcon weight="bold" />
			Detect
		</z-button>
	</div>
	<Segmented label="Theme" options={THEME_OPTIONS} value={app.settings.mode} onchange={(value) => setTheme(value as ModeT)} />
	<SettingSlider label="Logo border" value={app.settings.logoBorder} min={0} max={1} step={0.05} onchange={(value) => (app.settings.logoBorder = value)} />
	<SettingSlider label="Reactivity" value={app.settings.reactivity} min={0} max={2} step={0.05} onchange={(value) => (app.settings.reactivity = value)} />
</Section>

<Section title="Palette">
	<ColorRow label="Accent 1" value={app.settings.accent1} onchange={(value) => (app.settings.accent1 = value)} />
	<ColorRow label="Accent 2" value={app.settings.accent2} onchange={(value) => (app.settings.accent2 = value)} />
	<ColorRow label="Background" value={app.settings.background} onchange={(value) => (app.settings.background = value)} />
	<ColorRow label="Foreground" value={app.settings.foreground} onchange={(value) => (app.settings.foreground = value)} />
</Section>

<Section title="Echoes">
	<SettingSwitch label="Enable" isChecked={app.settings.isEchoesOn} onchange={(isChecked) => (app.settings.isEchoesOn = isChecked)} />
	<SettingSlider label="Amount" value={app.settings.echoAmount} min={0} max={2} step={0.05} isDisabled={!app.settings.isEchoesOn} onchange={(value) => (app.settings.echoAmount = value)} />
	<SettingSlider label="Size" value={app.settings.echoSize} min={0} max={2} step={0.05} isDisabled={!app.settings.isEchoesOn} onchange={(value) => (app.settings.echoSize = value)} />
	<SettingSlider label="Speed" value={app.settings.echoSpeed} min={0.4} max={3} step={0.05} isDisabled={!app.settings.isEchoesOn} onchange={(value) => (app.settings.echoSpeed = value)} />
	<div class="settings-chips">
		{#each STYLE_CHIPS as chip (chip.name)}
			<z-badge
				size="medium"
				tone="primary"
				kind={app.settings.echoStyles[chip.name] ? 'soft' : 'outline'}
				isSelectable
				isSelected={app.settings.echoStyles[chip.name]}
				isDisabled={!checkIsStyleAvailable(chip.name)}
				onselect={(event: Event) => handleStyleSelect(chip.name, event)}
			>
				{chip.label}
			</z-badge>
		{/each}
	</div>
</Section>

<Section title="Glitch">
	<SettingSwitch label="Enable" isChecked={app.settings.isGlitchOn} onchange={(isChecked) => (app.settings.isGlitchOn = isChecked)} />
	<SettingSlider label="Amount" value={app.settings.glitchAmount} min={0} max={2} step={0.05} isDisabled={!app.settings.isGlitchOn} onchange={(value) => (app.settings.glitchAmount = value)} />
</Section>

<Section title="Texture">
	<SettingSwitch label="Enable" isChecked={app.settings.isTextureOn} onchange={(isChecked) => (app.settings.isTextureOn = isChecked)} />
	<SettingSlider label="Amount" value={app.settings.textureAmount} min={0} max={2} step={0.05} isDisabled={!app.settings.isTextureOn} onchange={(value) => (app.settings.textureAmount = value)} />
</Section>

<Section title="Solids">
	<SettingSwitch label="Enable" isChecked={app.settings.isSolidOn} onchange={(isChecked) => (app.settings.isSolidOn = isChecked)} />
	<SettingSlider label="Amount" value={app.settings.solidAmount} min={0} max={2} step={0.05} isDisabled={!app.settings.isSolidOn} onchange={(value) => (app.settings.solidAmount = value)} />
</Section>
