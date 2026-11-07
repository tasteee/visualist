<script lang="ts">
	import { recordHistory } from '../automation.svelte'
	import './controls.css'

	type SegmentOptionT = {
		value: string
		label: string
	}

	type SegmentedPropsT = {
		options: SegmentOptionT[]
		value: string
		label: string
		isDisabled?: boolean
		onchange: (value: string) => void
	}

	const props: SegmentedPropsT = $props()

	const handlePick = (optionValue: string) => {
		const isChange = optionValue !== props.value
		if (isChange) recordHistory()
		props.onchange(optionValue)
	}

	const getKind = (optionValue: string): string => {
		const isSelected = optionValue === props.value
		if (isSelected) return 'soft'
		return 'outline'
	}

	const getTone = (optionValue: string): string => {
		const isSelected = optionValue === props.value
		if (isSelected) return 'primary'
		return 'neutral'
	}
</script>

<div class="segmented" role="group" aria-label={props.label}>
	<z-button-group>
		{#each props.options as option (option.value)}
			<z-button
				size="sm"
				kind={getKind(option.value)}
				tone={getTone(option.value)}
				isDisabled={props.isDisabled ?? false}
				aria-pressed={option.value === props.value}
				onclick={() => handlePick(option.value)}
			>
				{option.label}
			</z-button>
		{/each}
	</z-button-group>
</div>
