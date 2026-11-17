<script lang="ts">
	import { CaretRightIcon } from 'phosphor-svelte'
	import type { Snippet } from 'svelte'
	import './controls.css'

	type SectionPropsT = {
		title: string
		description?: string
		children: Snippet
		action?: Snippet
	}

	const props: SectionPropsT = $props()
	let isExpanded = $state(true)
	const caretClass = $derived(isExpanded ? 'panel-section-caret isExpanded' : 'panel-section-caret')
	const handleToggle = (): void => {
		isExpanded = !isExpanded
	}
</script>

<section class="panel-section" class:isExpanded>
	<div class="panel-section-header">
		<button class="panel-section-toggle" type="button" aria-expanded={isExpanded} onclick={handleToggle}>
			<span class="panel-section-title">{props.title.toUpperCase()}</span>
			<CaretRightIcon class={caretClass} weight="bold" />
		</button>
		{#if props.action}
			<div class="panel-section-action">
				{@render props.action()}
			</div>
		{/if}
	</div>
	{#if isExpanded && props.description}
		<p class="panel-section-description">{props.description}</p>
	{/if}
	{#if isExpanded}
		<div class="panel-section-body">
			{@render props.children()}
		</div>
	{/if}
</section>
