<script lang="ts">
	import WaveformIcon from 'phosphor-svelte/lib/WaveformIcon'
	import { app, detectBpm, getAnalysis, setBpm, setTheme, setTitle } from '../store.svelte'
	import type { EchoStyleNameT, ModeT } from '../engine/types'
	import ColorRow from './ColorRow.svelte'
	import ControlSlider from './ControlSlider.svelte'
	import Segmented from './Segmented.svelte'
	import './SettingsPanel.css'

	type StyleChipT = {
		name: EchoStyleNameT
		label: string
	}

	const THEME_OPTIONS = [
		{ value: 'light', label: 'Light Theme' },
		{ value: 'dark', label: 'Dark Theme' }
	]

	const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
	const KEY_OPTIONS = KEY_NAMES.map((name) => ({ value: name, label: name }))

	const SCALE_OPTIONS = [
		{ value: 'Major', label: 'Major' },
		{ value: 'Minor', label: 'Minor' }
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
		const isEchoOn = app.settings.echoAmount > 0
		const isBlockedByGlitch = name === 'sliced' && app.settings.glitchAmount <= 0
		const isBlockedByTexture = name === 'gritty' && app.settings.textureAmount <= 0
		return isEchoOn && !isBlockedByGlitch && !isBlockedByTexture
	}

	const handleTitleInput = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		setTitle(detail.value)
	}

	const handleKeyChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		app.musicalKey = detail.value
	}

	const handleScaleChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		app.musicalScale = detail.value
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

<div class="settings-panel">
	<z-input value={app.title} placeholder="Track title" aria-label="Track title" onchange={handleTitleInput} oninput={handleTitleInput}></z-input>

	<div class="settings-pair">
		<z-select value={app.musicalKey} options={KEY_OPTIONS} placeholder="Key" aria-label="Key" onchange={handleKeyChange}></z-select>
		<z-select value={app.musicalScale} options={SCALE_OPTIONS} placeholder="Scale" aria-label="Scale" onchange={handleScaleChange}></z-select>
	</div>

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
	<ControlSlider controlKey="logoBorder" label="Logo border" />
	<ControlSlider controlKey="reactivity" label="Reactivity" />

	<ColorRow label="Accent 1" value={app.settings.accent1} onchange={(value) => (app.settings.accent1 = value)} />
	<ColorRow label="Accent 2" value={app.settings.accent2} onchange={(value) => (app.settings.accent2 = value)} />
	<ColorRow label="Background" value={app.settings.background} onchange={(value) => (app.settings.background = value)} />
	<ColorRow label="Foreground" value={app.settings.foreground} onchange={(value) => (app.settings.foreground = value)} />

	<ControlSlider controlKey="echoAmount" label="Echoes Amount" />
	<ControlSlider controlKey="echoSize" label="Echoes Size" />
	<ControlSlider controlKey="echoSpeed" label="Echoes Speed" />
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

	<ControlSlider controlKey="glitchAmount" label="Glitch Amount" />
	<ControlSlider controlKey="textureAmount" label="Texture Amount" />
	<ControlSlider controlKey="solidAmount" label="Solids Amount" />
</div>
