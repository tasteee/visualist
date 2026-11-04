<script lang="ts">
	import LightningIcon from 'phosphor-svelte/lib/LightningIcon'
	import WaveSineIcon from 'phosphor-svelte/lib/WaveSineIcon'
	import { formatModulation } from '../engine/modulation'
	import type { ModulationT } from '../engine/types'
	import ModEditor from './ModEditor.svelte'
	import './controls.css'

	type SettingSliderPropsT = {
		label: string
		value: number
		min: number
		max: number
		step: number
		hint?: string
		suffix?: string
		isDisabled?: boolean
		// 1-5 when an automation lane drives this control, matching
		// the lane's color. 0 or missing when it is free.
		automationTone?: number
		onreveal?: () => void
		// Passing onautomate shows an Automate button on hover
		// while the control has no lane.
		onautomate?: () => void
		// Passing onmodulationchange turns on the mod badge.
		// liveValue is where the modulation has pushed the value
		// at the playhead, shown as a meter under the slider.
		modulation?: ModulationT | null
		liveValue?: number
		onmodulationchange?: (modulation: ModulationT | null) => void
		onchange: (value: number) => void
	}

	const props: SettingSliderPropsT = $props()

	const AUTOMATED_TOOLTIP = 'Managed by automation. Click to open its lane, or remove the lane to unlock.'

	const automationTone = $derived(props.automationTone ?? 0)
	const isAutomated = $derived(automationTone > 0)
	const isLocked = $derived(isAutomated || (props.isDisabled ?? false))
	const hasHint = $derived(props.hint !== undefined && !isAutomated)
	const tooltipText = $derived(props.hint ?? '')
	const badgeClass = $derived(`setting-slider-badge isTone${automationTone}`)
	const valueClass = $derived(`setting-slider-value isTone${automationTone}`)
	const valueLabel = $derived(`${Number(props.value.toFixed(2))}${props.suffix ?? ''}`)

	let isModOpen = $state(false)

	const modulation = $derived(props.modulation ?? null)
	const canModulate = $derived(props.onmodulationchange !== undefined)
	const isModulated = $derived(modulation !== null)
	const modLabel = $derived(modulation === null ? 'Modulate' : formatModulation(modulation))
	const modAriaLabel = $derived(isModulated ? `${props.label}: ${modLabel}. Edit modulation.` : `Modulate ${props.label}`)
	const range = $derived(props.max - props.min)
	const liveValue = $derived(props.liveValue ?? props.value)
	const livePercent = $derived(range <= 0 ? 0 : Math.min(100, Math.max(0, ((liveValue - props.min) / range) * 100)))
	const liveStyle = $derived(`${livePercent.toFixed(2)}%`)

	const canAutomate = $derived(props.onautomate !== undefined && !isAutomated)
	const automateLabel = $derived(`Automate ${props.label} in the timeline`)

	const handleAutomate = () => props.onautomate?.()

	const handleModToggle = () => {
		isModOpen = !isModOpen
	}

	const handleModChange = (nextModulation: ModulationT | null) => {
		props.onmodulationchange?.(nextModulation)
	}

	const handleInput = (event: Event) => {
		const detail = (event as CustomEvent<{ value: number }>).detail
		props.onchange(detail.value)
	}

	const handleReveal = () => props.onreveal?.()
</script>

<div class="setting-slider" class:isDisabled={props.isDisabled && !isAutomated} class:isAutomated class:isModulated class:canModulate>
	<div class="setting-slider-header">
		<span class="setting-slider-label">{props.label}</span>
		{#if isAutomated}
			<z-tooltip content={AUTOMATED_TOOLTIP} placement="left" openDelay={200}>
				<button class={badgeClass} type="button" aria-label="{props.label} is automated. Open its lane." onclick={handleReveal}>
					<LightningIcon weight="fill" />
					Automated
				</button>
			</z-tooltip>
		{/if}
		{#if canAutomate}
			<z-tooltip content={automateLabel} placement="left" openDelay={300}>
				<button class="setting-slider-automate" type="button" aria-label={automateLabel} onclick={handleAutomate}>
					<LightningIcon weight="bold" />
				</button>
			</z-tooltip>
		{/if}
		{#if canModulate}
			<button class="setting-slider-mod" class:isActive={isModulated} class:isOpen={isModOpen} type="button" aria-label={modAriaLabel} aria-expanded={isModOpen} onclick={handleModToggle}>
				<WaveSineIcon weight="bold" />
				{#if isModulated}
					<span class="setting-slider-mod-label">{modLabel}</span>
				{/if}
			</button>
		{/if}
		<span class={valueClass}>{valueLabel}</span>
	</div>
	<z-tooltip content={tooltipText} isDisabled={!hasHint} placement="left" openDelay={400}>
		<z-slider
			aria-label={props.label}
			value={props.value}
			min={props.min}
			max={props.max}
			step={props.step}
			isDisabled={isLocked}
			oninput={handleInput}
			onchange={handleInput}
		></z-slider>
	</z-tooltip>
	{#if isModulated}
		<div class="setting-slider-meter" aria-hidden="true">
			<span class="setting-slider-meter-fill" style:width={liveStyle}></span>
		</div>
	{/if}
	{#if canModulate && isModOpen}
		<ModEditor label={props.label} {modulation} onchange={handleModChange} />
	{/if}
</div>
