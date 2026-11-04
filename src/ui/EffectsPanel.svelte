<script lang="ts">
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon'
	import { app, applyPreset, formatTime, getInkFinish, resetAllSettings } from '../store.svelte'
	import { findActivePreset } from '../engine/settings'
	import type { PresetNameT } from '../engine/settings'
	import type { EchoStyleNameT } from '../engine/types'
	import Section from './Section.svelte'
	import Segmented from './Segmented.svelte'
	import SettingSlider from './SettingSlider.svelte'
	import SettingSwitch from './SettingSwitch.svelte'
	import './EffectsPanel.css'

	type StyleChipT = {
		name: EchoStyleNameT
		label: string
	}

	const PRESET_OPTIONS = [
		{ value: 'clean', label: 'Clean' },
		{ value: 'default', label: 'Default' },
		{ value: 'wild', label: 'Wild' }
	]

	const STYLE_CHIPS: StyleChipT[] = [
		{ name: 'hollow', label: 'Hollow' },
		{ name: 'faintFill', label: 'Faint fill' },
		{ name: 'double', label: 'Double' },
		{ name: 'sliced', label: 'Sliced' },
		{ name: 'gritty', label: 'Gritty' }
	]

	const activePreset = $derived(findActivePreset(app.settings) ?? '')
	const inkFinishLabel = $derived(formatTime(getInkFinish()))
	const inkSummary = $derived(`Fully flipped at ${inkFinishLabel}`)
	const isInkInactive = $derived(!app.settings.isInkOn)

	const checkIsStyleAvailable = (name: EchoStyleNameT): boolean => {
		const isEchoOn = app.settings.isEchoesOn
		const isBlockedByGlitch = name === 'sliced' && !app.settings.isGlitchOn
		const isBlockedByTexture = name === 'gritty' && !app.settings.isTextureOn
		return isEchoOn && !isBlockedByGlitch && !isBlockedByTexture
	}

	const handleStyleSelect = (name: EchoStyleNameT, event: Event) => {
		const detail = (event as CustomEvent<{ selected: boolean }>).detail
		app.settings.echoStyles[name] = detail.selected
	}

	const handleInkNumber = (key: 'inkStart' | 'inkDoneBeforeEnd', minimum: number, event: Event) => {
		const detail = (event as CustomEvent<{ value: number }>).detail
		const isValid = Number.isFinite(detail.value) && detail.value >= minimum
		if (isValid) app.settings[key] = detail.value
	}
</script>

<Section title="Presets" description="Presets only change the amounts and echo styles. Your colors and switches stay.">
	{#snippet action()}
		<z-button size="sm" kind="ghost" tone="neutral" onclick={resetAllSettings}>
			<ArrowCounterClockwiseIcon weight="bold" />
			Reset all
		</z-button>
	{/snippet}
	<Segmented label="Preset" options={PRESET_OPTIONS} value={activePreset} onchange={(value) => applyPreset(value as PresetNameT)} />
</Section>

<Section title="Echoes" description="Copies of the logo that expand from behind it and fade.">
	<SettingSwitch label="Echoes" isChecked={app.settings.isEchoesOn} onchange={(isChecked) => (app.settings.isEchoesOn = isChecked)} />
	<SettingSlider label="Amount" value={app.settings.echoAmount} min={0} max={2} step={0.05} isDisabled={!app.settings.isEchoesOn} onchange={(value) => (app.settings.echoAmount = value)} />
	<SettingSlider label="Size" value={app.settings.echoSize} min={0} max={2} step={0.05} isDisabled={!app.settings.isEchoesOn} onchange={(value) => (app.settings.echoSize = value)} />
	<SettingSlider label="Speed" value={app.settings.echoSpeed} min={0.4} max={3} step={0.05} isDisabled={!app.settings.isEchoesOn} onchange={(value) => (app.settings.echoSpeed = value)} />
	<div class="effects-chips">
		<span class="effects-chips-label">Styles the music may pick</span>
		<div class="effects-chip-row">
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
		<span class="effects-chips-note">Sliced needs Glitch on. Gritty needs Texture on.</span>
	</div>
</Section>

<Section title="Logo motion">
	<SettingSlider label="Bass bounce" value={app.settings.bassBounce} min={0} max={2} step={0.05} onchange={(value) => (app.settings.bassBounce = value)} />
	<SettingSwitch
		label="Glitch"
		description="Slicing, tear bars, sliced echoes and the title split."
		isChecked={app.settings.isGlitchOn}
		onchange={(isChecked) => (app.settings.isGlitchOn = isChecked)}
	/>
	<SettingSlider label="Glitch amount" value={app.settings.glitchAmount} min={0} max={2} step={0.05} isDisabled={!app.settings.isGlitchOn} onchange={(value) => (app.settings.glitchAmount = value)} />
</Section>

<Section title="Surface">
	<SettingSwitch
		label="Texture"
		description="Grain, dust, worn text and gritty echoes."
		hint="Adds a speckled film and swaps the logo for distressed versions on bright, busy hits."
		isChecked={app.settings.isTextureOn}
		onchange={(isChecked) => (app.settings.isTextureOn = isChecked)}
	/>
	<SettingSlider label="Texture amount" value={app.settings.textureAmount} min={0} max={2} step={0.05} isDisabled={!app.settings.isTextureOn} onchange={(value) => (app.settings.textureAmount = value)} />
	<SettingSwitch
		label="Solid color layers"
		description="Glow, color split and faint fills."
		hint="The filled accent-color copies of the logo. One switch turns them all off."
		isChecked={app.settings.isSolidOn}
		onchange={(isChecked) => (app.settings.isSolidOn = isChecked)}
	/>
	<SettingSlider label="Solid amount" value={app.settings.solidAmount} min={0} max={2} step={0.05} isDisabled={!app.settings.isSolidOn} onchange={(value) => (app.settings.solidAmount = value)} />
</Section>

<Section title="Ink takeover" description="One ink blob spreads from the logo and flips the whole frame to the opposite mode.">
	<SettingSwitch label="Ink takeover" isChecked={app.settings.isInkOn} onchange={(isChecked) => (app.settings.isInkOn = isChecked)} />
	<div class="effects-ink-fields">
		<z-field label="Starts at (s)">
			<z-number-input
				value={app.settings.inkStart}
				min={0}
				step={1}
				isFullWidth
				isDisabled={isInkInactive}
				onchange={(event: Event) => handleInkNumber('inkStart', 0, event)}
			></z-number-input>
		</z-field>
		<z-field label="Done before end (s)">
			<z-number-input
				value={app.settings.inkDoneBeforeEnd}
				min={1}
				step={1}
				isFullWidth
				isDisabled={isInkInactive}
				onchange={(event: Event) => handleInkNumber('inkDoneBeforeEnd', 1, event)}
			></z-number-input>
		</z-field>
	</div>
	<p class="effects-ink-summary" class:isInactive={isInkInactive}>{inkSummary}</p>
</Section>
