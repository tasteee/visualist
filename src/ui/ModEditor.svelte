<script lang="ts">
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon'
	import { DEFAULT_MOD_AMOUNT, listModSourceOptions } from '../engine/modulation'
	import type { ModSourceT, ModulationT } from '../engine/types'
	import { getCompiledSources } from '../sources.svelte'
	import './ModEditor.css'

	type ModEditorPropsT = {
		label: string
		modulation: ModulationT | null
		onchange: (modulation: ModulationT | null) => void
	}

	const props: ModEditorPropsT = $props()

	const OFF_VALUE = 'off'
	const OFF_OPTION = { value: OFF_VALUE, label: 'Off' }

	const selectedSource = $derived(props.modulation === null ? null : props.modulation.source)
	const sourceOptions = $derived([OFF_OPTION, ...listModSourceOptions(getCompiledSources(), selectedSource)])

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

<z-column gap="2" isFullWidth class="mod-editor" role="group" aria-label="Modulate {props.label}">
	<z-row alignsY="center" gap="2" isFullWidth class="mod-editor-row">
		<z-text size="xs" weight={500} class="mod-editor-label">Follow</z-text>
		<z-select class="mod-editor-source" value={sourceValue} options={sourceOptions} size="sm" aria-label="Modulation source" onchange={handleSourceChange}></z-select>
		{#if hasModulation}
			<z-tooltip content="Remove modulation" placement="left" openDelay={300}>
				<z-button isIcon size="sm" kind="ghost" tone="neutral" aria-label="Remove modulation" onclick={handleRemove}>
					<TrashIcon weight="bold" />
				</z-button>
			</z-tooltip>
		{/if}
	</z-row>
	{#if hasModulation}
		<z-column gap="1" isFullWidth class="mod-editor-amount">
			<z-row alignsY="center" alignsX="between" isFullWidth class="mod-editor-amount-header">
				<z-text size="xs" color="muted" class="mod-editor-label">Depth</z-text>
				<z-text size="xs" color="muted" class="mod-editor-amount-value">{amountLabel}</z-text>
			</z-row>
			<z-slider aria-label="Modulation depth" value={amountValue} min={-1} max={1} step={0.01} oninput={handleAmountChange} onchange={handleAmountChange}></z-slider>
		</z-column>
	{/if}
</z-column>
