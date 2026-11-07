<script lang="ts">
	import { recordHistoryCoalesced } from '../automation.svelte'
	import './controls.css'

	type ColorRowPropsT = {
		label: string
		value: string
		onchange: (value: string) => void
	}

	const props: ColorRowPropsT = $props()

	const handleChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		const nextValue = detail.value.toLowerCase()
		const isChange = nextValue !== props.value
		if (isChange) recordHistoryCoalesced(`color:${props.label}`)
		props.onchange(nextValue)
	}
</script>

<div class="color-row">
	<div class="color-row-text">
		<span class="color-row-label">{props.label}</span>
	</div>
	<z-color-picker label={props.label} value={props.value} onchange={handleChange}></z-color-picker>
</div>
