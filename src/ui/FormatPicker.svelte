<script lang="ts">
	import { FORMAT_PRESETS } from '../engine/formats'
	import type { FormatPresetT } from '../engine/formats'
	import type { AspectRatioT } from '../engine/types'
	import './FormatPicker.css'

	type FormatPickerPropsT = {
		value: AspectRatioT
		isDisabled?: boolean
		onchange: (value: AspectRatioT) => void
	}

	const props: FormatPickerPropsT = $props()

	const isDisabled = $derived(props.isDisabled ?? false)

	const getShapeClass = (preset: FormatPresetT): string => {
		const isVertical = preset.value === '9:16'
		if (isVertical) return 'isVertical'
		const isSquare = preset.value === '1:1'
		if (isSquare) return 'isSquare'
		const isPortrait = preset.value === '4:5'
		if (isPortrait) return 'isPortrait'
		return 'isLandscape'
	}

	const handleSelect = (preset: FormatPresetT) => {
		if (isDisabled) return
		props.onchange(preset.value)
	}
</script>

<div class="format-picker" role="radiogroup" aria-label="Video format">
	{#each FORMAT_PRESETS as preset (preset.value)}
		{@const isSelected = preset.value === props.value}
		{@const shapeClass = getShapeClass(preset)}
		<button
			type="button"
			class="format-option"
			class:isSelected
			role="radio"
			aria-checked={isSelected}
			disabled={isDisabled}
			onclick={() => handleSelect(preset)}
		>
			<span class="format-glyph" aria-hidden="true">
				<span class="format-glyph-shape {shapeClass}"></span>
			</span>
			<span class="format-text">
				<span class="format-heading">
					<span class="format-name">{preset.name}</span>
					<span class="format-ratio">{preset.value}</span>
				</span>
				<span class="format-platforms">{preset.platforms}</span>
			</span>
		</button>
	{/each}
</div>
