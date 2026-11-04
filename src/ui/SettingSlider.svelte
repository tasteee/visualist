<script lang="ts">
	import LightningIcon from 'phosphor-svelte/lib/LightningIcon'
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

	const handleInput = (event: Event) => {
		const detail = (event as CustomEvent<{ value: number }>).detail
		props.onchange(detail.value)
	}

	const handleReveal = () => props.onreveal?.()
</script>

<div class="setting-slider" class:isDisabled={props.isDisabled && !isAutomated} class:isAutomated>
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
</div>
