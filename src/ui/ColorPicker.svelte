<script lang="ts">
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon'
	import { layerStore } from '../layers.svelte'
	import { findColor, palette } from '../palette.svelte'
	import { pushRecentColor, recentColors } from '../recentColors.svelte'
	import './ColorPicker.css'

	// A color is a palette color's id, or a color of its own as #rrggbb.
	// The menu lists the palette, the custom colors already used in the
	// project, and the ones picked lately. Custom opens the system picker.
	type ColorPickerPropsT = {
		value: string
		label: string
		// isContinuous is true while a custom color is being dragged.
		onchange: (value: string, isContinuous: boolean) => void
	}

	const props: ColorPickerPropsT = $props()

	let isOpen = $state(false)

	const checkIsHex = (value: string): boolean => value.startsWith('#')

	const resolve = (value: string): string => {
		if (checkIsHex(value)) return value
		return findColor(value)?.value ?? '#ffffff'
	}

	const getName = (value: string): string => {
		if (checkIsHex(value)) return value.toUpperCase()
		return findColor(value)?.name ?? 'Missing color'
	}

	// Custom colors anywhere in the project, text and shapes alike.
	const projectColors = $derived.by(() => {
		const found = new Set<string>()
		const add = (value: string | undefined) => {
			if (value !== undefined && checkIsHex(value)) found.add(value.toLowerCase())
		}
		for (const layer of layerStore.layers) {
			add(layer.text?.color)
			add(layer.shape?.color)
			add(layer.shape?.color2)
			for (const clip of layer.clips) add(clip.textStyle.color)
		}
		return [...found]
	})

	const recent = $derived(recentColors.values.filter((value) => checkIsHex(value) || findColor(value) !== undefined))

	const handlePick = (value: string) => {
		props.onchange(value, false)
		pushRecentColor(value)
	}

	const handleCustomInput = (event: Event) => props.onchange((event.currentTarget as HTMLInputElement).value.toLowerCase(), true)

	const handleCustomChange = (event: Event) => {
		const value = (event.currentTarget as HTMLInputElement).value.toLowerCase()
		props.onchange(value, false)
		pushRecentColor(value)
	}

	const handleToggle = () => (isOpen = !isOpen)
</script>

<div class="color-picker">
	<z-button class="color-picker-trigger" size="sm" kind="outline" tone="neutral" isFullWidth aria-label={props.label} aria-expanded={isOpen} onclick={handleToggle}>
		<span class="color-picker-swatch" style:background={resolve(props.value)}></span>
		<span class="color-picker-name">{getName(props.value)}</span>
		<CaretDownIcon weight="bold" />
	</z-button>

	{#if isOpen}
		<div class="color-picker-menu">
			<span class="color-picker-heading">Palette</span>
			<div class="color-picker-grid">
				{#each palette.colors as color (color.id)}
					<button class="color-picker-chip" class:isActive={props.value === color.id} type="button" title={color.name} aria-label={color.name} style:background={color.value} onclick={() => handlePick(color.id)}></button>
				{/each}
			</div>

			{#if projectColors.length > 0}
				<span class="color-picker-heading">Project</span>
				<div class="color-picker-grid">
					{#each projectColors as value (value)}
						<button class="color-picker-chip" class:isActive={props.value.toLowerCase() === value} type="button" title={value.toUpperCase()} aria-label={value.toUpperCase()} style:background={value} onclick={() => handlePick(value)}></button>
					{/each}
				</div>
			{/if}

			{#if recent.length > 0}
				<span class="color-picker-heading">Recent</span>
				<div class="color-picker-grid">
					{#each recent as value (value)}
						<button class="color-picker-chip" class:isActive={props.value === value} type="button" title={getName(value)} aria-label={getName(value)} style:background={resolve(value)} onclick={() => handlePick(value)}></button>
					{/each}
				</div>
			{/if}

			<label class="color-picker-custom">
				<input type="color" value={resolve(props.value)} aria-label="Custom color" oninput={handleCustomInput} onchange={handleCustomChange} />
				<span>Custom color…</span>
			</label>
		</div>
	{/if}
</div>
