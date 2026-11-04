<script lang="ts">
	import './controls.css'

	type ColorRowPropsT = {
		label: string
		description: string
		value: string
		onchange: (value: string) => void
	}

	const props: ColorRowPropsT = $props()

	const handleChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		props.onchange(detail.value.toLowerCase())
	}
</script>

<div class="color-row">
	<div class="color-row-text">
		<span class="color-row-label">{props.label}</span>
		<span class="color-row-description">{props.description}</span>
	</div>
	<z-color-picker label={props.label} value={props.value} onchange={handleChange}></z-color-picker>
</div>
