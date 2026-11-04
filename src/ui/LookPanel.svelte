<script lang="ts">
	import { app, setTitle } from '../store.svelte'
	import ColorRow from './ColorRow.svelte'
	import Section from './Section.svelte'
	import Segmented from './Segmented.svelte'
	import SettingSlider from './SettingSlider.svelte'
	import type { ModeT, TitleColorT } from '../engine/types'

	const MODE_OPTIONS = [
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	]

	const TITLE_COLOR_OPTIONS = [
		{ value: 'auto', label: 'Auto' },
		{ value: 'accent1', label: 'Accent 1' },
		{ value: 'accent2', label: 'Accent 2' }
	]

	const handleTitleInput = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		setTitle(detail.value)
	}
</script>

<Section title="Appearance" description="Light uses Paper behind an Ink logo. Dark swaps them.">
	<Segmented label="Mode" options={MODE_OPTIONS} value={app.settings.mode} onchange={(value) => (app.settings.mode = value as ModeT)} />
	<SettingSlider
		label="Logo separation"
		hint="Clears space behind the letters so the logo stays readable over busy effects."
		value={app.settings.logoSeparation}
		min={0}
		max={1}
		step={0.05}
		onchange={(value) => (app.settings.logoSeparation = value)}
	/>
</Section>

<Section title="Palette" description="Every color feeds both sides of the ink takeover.">
	<ColorRow label="Accent 1" description="Echoes, glow, glitch edge" value={app.settings.accent1} onchange={(value) => (app.settings.accent1 = value)} />
	<ColorRow label="Accent 2" description="The second glitch color" value={app.settings.accent2} onchange={(value) => (app.settings.accent2 = value)} />
	<ColorRow label="Ink" description="Logo in Light, background in Dark" value={app.settings.ink} onchange={(value) => (app.settings.ink = value)} />
	<ColorRow label="Paper" description="Background in Light, logo in Dark" value={app.settings.paper} onchange={(value) => (app.settings.paper = value)} />
</Section>

<Section title="Title" description="Set in DM Sans Black along the bottom of the video.">
	<z-field label="Track title">
		<z-input value={app.title} placeholder="Untitled track" onchange={handleTitleInput} oninput={handleTitleInput}></z-input>
	</z-field>
	<SettingSlider
		label="Size"
		value={app.settings.titleSize}
		min={24}
		max={90}
		step={1}
		suffix=" px"
		onchange={(value) => (app.settings.titleSize = value)}
	/>
	<div class="title-color">
		<Segmented
			label="Title color"
			options={TITLE_COLOR_OPTIONS}
			value={app.settings.titleColor}
			onchange={(value) => (app.settings.titleColor = value as TitleColorT)}
		/>
	</div>
</Section>
