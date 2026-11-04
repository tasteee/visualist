<script lang="ts">
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
		onchange: (value: number) => void
	}

	const props: SettingSliderPropsT = $props()

	const hasHint = $derived(props.hint !== undefined)
	const tooltipText = $derived(props.hint ?? '')

	const handleInput = (event: Event) => {
		const detail = (event as CustomEvent<{ value: number }>).detail
		props.onchange(detail.value)
	}
</script>

<div class="setting-slider" class:isDisabled={props.isDisabled}>
	<z-tooltip content={tooltipText} isDisabled={!hasHint} placement="left" openDelay={400}>
		<z-slider
			label={props.label}
			value={props.value}
			min={props.min}
			max={props.max}
			step={props.step}
			valueSuffix={props.suffix ?? ''}
			doesShowValue
			isDisabled={props.isDisabled ?? false}
			oninput={handleInput}
			onchange={handleInput}
		></z-slider>
	</z-tooltip>
</div>
