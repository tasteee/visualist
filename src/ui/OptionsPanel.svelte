<script lang="ts">
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon'
	import { resetProject } from '../resetProject'
	import Section from './Section.svelte'

	// Project-wide actions. Reset asks twice, since it can not be undone.
	let isConfirming = $state(false)

	const confirmLabel = $derived(isConfirming ? 'Click again to erase everything' : 'Reset project')

	const handleReset = () => {
		if (!isConfirming) {
			isConfirming = true
			return
		}
		void resetProject()
	}

	const handleCancel = () => {
		isConfirming = false
	}
</script>

<Section title="Project" description="Reset clears the song, every layer, lane and color, and starts again with only the scene and post layers. It can not be undone.">
	<z-button size="md" kind={isConfirming ? 'solid' : 'outline'} tone="danger" isFullWidth onclick={handleReset}>
		<ArrowCounterClockwiseIcon weight="bold" />
		{confirmLabel}
	</z-button>
	{#if isConfirming}
		<z-button size="md" kind="ghost" tone="neutral" isFullWidth onclick={handleCancel}>Keep my project</z-button>
	{/if}
</Section>
