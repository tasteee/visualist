<script lang="ts">
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon'
	import XIcon from 'phosphor-svelte/lib/XIcon'
	import { recordHistory, recordHistoryCoalesced } from '../automation.svelte'
	import { addColor, palette, removeColor, setColorValue } from '../palette.svelte'
	import { app } from '../store.svelte'
	import ColorRow from './ColorRow.svelte'
	import Section from './Section.svelte'
	import './PalettePanel.css'

	// The colors the project is made of. Layers pick from these, so a
	// change here shows everywhere the color is used.
	const handleInput = (event: Event, colorId: string) => {
		const input = event.currentTarget as HTMLInputElement
		recordHistoryCoalesced(`palette:${colorId}`)
		setColorValue(colorId, input.value)
	}

	const handleAdd = () => {
		recordHistory()
		addColor()
	}

	const handleRemove = (event: MouseEvent, colorId: string) => {
		event.preventDefault()
		event.stopPropagation()
		recordHistory()
		removeColor(colorId)
	}

	const hasColors = $derived(palette.colors.length > 0)
</script>

<Section title="Stage" description="The color behind everything. Layers choose their own colors from the palette below.">
	<ColorRow label="Background" value={app.settings.background} onchange={(value) => (app.settings.background = value)} />
</Section>

<Section title="Colors" description="Click a color to change it. Layers that use it follow. A deleted color shows as white where it was used.">
	<div class="palette-grid">
		{#each palette.colors as color (color.id)}
			<label class="palette-swatch" title="{color.name} · {color.value}">
				<input class="palette-swatch-input" type="color" value={color.value} aria-label="Change {color.name}" oninput={(event) => handleInput(event, color.id)} />
				<span class="palette-swatch-fill" style:background={color.value}></span>
				<button class="palette-swatch-remove" type="button" aria-label="Delete {color.name}" onclick={(event) => handleRemove(event, color.id)}>
					<XIcon weight="bold" />
				</button>
			</label>
		{/each}
		<button class="palette-add" type="button" aria-label="Add a color" onclick={handleAdd}>
			<PlusIcon weight="bold" />
		</button>
	</div>
	{#if !hasColors}
		<p class="palette-empty">No colors yet. Add one to use it on a layer.</p>
	{/if}
</Section>
