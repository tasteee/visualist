<script lang="ts">
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon'
	import { DEFAULT_MOD_AMOUNT, MOD_SOURCES } from '../engine/modulation'
	import type { ModSourceT, ModulationT } from '../engine/types'
	import './ModEditor.css'

	type ModEditorPropsT = {
		label: string
		modulation: ModulationT | null
		onchange: (modulation: ModulationT | null) => void
	}

	const props: ModEditorPropsT = $props()

	const OFF_VALUE = 'off'
	const SOURCE_OPTIONS = [{ value: OFF_VALUE, label: 'Off' }, ...MOD_SOURCES]

	const hasModulation = $derived(props.modulation !== null)
	const sourceValue = $derived(props.modulation === null ? OFF_VALUE : props.modulation.source)
	const amountValue = $derived(props.modulation === null ? DEFAULT_MOD_AMOUNT : props.modulation.amount)
	const amountPercent = $derived(Math.round(amountValue * 100))
	const amountLabel = $derived(amountPercent > 0 ? `+${amountPercent}%` : `${amountPercent}%`)

	const handleSourceChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		const isOff = detail.value === OFF_VALUE
		if (isOff) return props.onchange(null)
		const source = detail.value as ModSourceT
		props.onchange({ source, amount: amountValue })
	}

	const handleAmountChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: number }>).detail
		const modulation = props.modulation
		if (modulation === null) return
		props.onchange({ source: modulation.source, amount: detail.value })
	}

	const handleRemove = () => props.onchange(null)
</script>

<div class="mod-editor" role="group" aria-label="Modulate {props.label}">
	<div class="mod-editor-row">
		<span class="mod-editor-label">Follow</span>
		<z-select class="mod-editor-source" value={sourceValue} options={SOURCE_OPTIONS} size="sm" aria-label="Modulation source" onchange={handleSourceChange}></z-select>
		{#if hasModulation}
			<z-tooltip content="Remove modulation" placement="left" openDelay={300}>
				<button class="mod-editor-remove" type="button" aria-label="Remove modulation" onclick={handleRemove}>
					<TrashIcon weight="bold" />
				</button>
			</z-tooltip>
		{/if}
	</div>
	{#if hasModulation}
		<div class="mod-editor-amount">
			<div class="mod-editor-amount-header">
				<span class="mod-editor-label">Depth</span>
				<span class="mod-editor-amount-value">{amountLabel}</span>
			</div>
			<z-slider aria-label="Modulation depth" value={amountValue} min={-1} max={1} step={0.01} oninput={handleAmountChange} onchange={handleAmountChange}></z-slider>
		</div>
	{/if}
</div>
