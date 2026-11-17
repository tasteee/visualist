<script lang="ts">
	import { findColor, palette } from '../palette.svelte'
	import { pushRecentColor } from '../recentColors.svelte'
	import './ColorPicker.css'

	type ColorPickerPropsT = {
		value: string
		label: string
		// isContinuous is true while a custom color is being dragged.
		onchange: (value: string, isContinuous: boolean) => void
	}

	const props: ColorPickerPropsT = $props()

	const checkIsHex = (value: string): boolean => value.startsWith('#')

	const resolve = (value: string): string => {
		if (checkIsHex(value)) return value
		return findColor(value)?.value ?? '#ffffff'
	}

	// Global set colors from the palette are passed directly as presets into z-color-picker
	const presets = $derived(palette.colors.map((color) => color.value))

	const handleChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		const hex = detail.value.toLowerCase()

		// If the selected color matches one of our global set palette colors, link by ID
		const matchedPaletteColor = palette.colors.find(
			(color) => color.value.toLowerCase() === hex
		)
		const finalValue = matchedPaletteColor ? matchedPaletteColor.id : hex
		props.onchange(finalValue, false)
		pushRecentColor(finalValue)
	}
</script>

<div class="color-picker-container">
	<z-color-picker
		label={props.label}
		value={resolve(props.value)}
		{presets}
		onchange={handleChange}
	></z-color-picker>
</div>
