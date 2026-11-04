<script lang="ts">
	import type { Snippet } from 'svelte'
	import './controls.css'

	type SectionPropsT = {
		title: string
		description?: string
		children: Snippet
		action?: Snippet
	}

	const props: SectionPropsT = $props()
</script>

<section class="panel-section">
	<header class="panel-section-header">
		<div class="panel-section-heading">
			<h3 class="panel-section-title">{props.title}</h3>
			{#if props.description}
				<p class="panel-section-description">{props.description}</p>
			{/if}
		</div>
		{#if props.action}
			{@render props.action()}
		{/if}
	</header>
	<div class="panel-section-body">
		{@render props.children()}
	</div>
</section>
