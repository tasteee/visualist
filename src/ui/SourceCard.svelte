<script lang="ts">
	import type { Snippet } from 'svelte'
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon'
	import type { ColorNameT } from '../engine/palette'
	import './SourceCard.css'

	// The shell every source in the Audio panel shares: a tone
	// dot, an editable name, a live meter and a remove button.
	type SourceCardPropsT = {
		color: ColorNameT
		isBand?: boolean
		name: string
		meta: string
		level: number
		removeLabel: string
		onrename: (name: string) => void
		onremove: () => void
		children: Snippet
	}

	const props: SourceCardPropsT = $props()

	const levelStyle = $derived(`${(props.level * 100).toFixed(1)}%`)

	const handleNameInput = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		props.onrename(detail.value)
	}
</script>

<article class="source-card" class:isBand={props.isBand} data-tone={props.color}>
	<header class="source-card-header">
		<span class="source-card-dot"></span>
		<z-input class="source-card-name" size="sm" value={props.name} aria-label="Name" oninput={handleNameInput} onchange={handleNameInput}></z-input>
		<z-tooltip content={props.removeLabel} placement="top" openDelay={300}>
			<button class="source-card-remove" type="button" aria-label={props.removeLabel} onclick={props.onremove}>
				<TrashIcon weight="bold" />
			</button>
		</z-tooltip>
	</header>
	<div class="source-card-status">
		<span class="source-card-meter" aria-hidden="true">
			<span class="source-card-meter-fill" style:--source-card-level={levelStyle}></span>
		</span>
		<span class="source-card-meta">{props.meta}</span>
	</div>
	<div class="source-card-body">
		{@render props.children()}
	</div>
</article>
