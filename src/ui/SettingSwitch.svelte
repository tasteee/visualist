<script lang="ts">
	import './controls.css'

	type SettingSwitchPropsT = {
		label: string
		isChecked: boolean
		hint?: string
		description?: string
		isDisabled?: boolean
		onchange: (isChecked: boolean) => void
	}

	const props: SettingSwitchPropsT = $props()

	const hasHint = $derived(props.hint !== undefined)
	const tooltipText = $derived(props.hint ?? '')

	const handleChange = (event: Event) => {
		const detail = (event as CustomEvent<{ checked: boolean }>).detail
		props.onchange(detail.checked)
	}
</script>

<div class="setting-switch" class:isDisabled={props.isDisabled}>
	<z-tooltip content={tooltipText} isDisabled={!hasHint} placement="left" openDelay={400}>
		<div class="setting-switch-text">
			<span class="setting-switch-label">{props.label}</span>
			{#if props.description}
				<span class="setting-switch-description">{props.description}</span>
			{/if}
		</div>
	</z-tooltip>
	<z-switch
		label={props.label}
		isChecked={props.isChecked}
		isDisabled={props.isDisabled ?? false}
		onchange={handleChange}
	></z-switch>
</div>
