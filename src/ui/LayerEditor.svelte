<script lang="ts">
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon'
	import CaretUpIcon from 'phosphor-svelte/lib/CaretUpIcon'
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon'
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon'
	import { getAsset } from '../engine/assets'
	import { BLEND_OPTIONS, FX_SPECS, LAYER_PARAMS, PALETTE_SLOT_OPTIONS, SVG_COLOR_OPTIONS, TEXT_WEIGHT_OPTIONS } from '../engine/layers'
	import { DEMO_LOOP_SECONDS } from '../engine/settings'
	import type { BlendModeT, FxKindT, LayerT, PaletteSlotT, SvgColorT, TextWeightT } from '../engine/types'
	import { addLayerFx, checkCanMove, layerStore, moveLayer, removeLayer, removeLayerFx } from '../layers.svelte'
	import { app } from '../store.svelte'
	import FxRow from './FxRow.svelte'
	import LayerParamSlider from './LayerParamSlider.svelte'
	import Section from './Section.svelte'
	import Segmented from './Segmented.svelte'
	import './LayerEditor.css'

	type LayerEditorPropsT = {
		layer: LayerT
	}

	const props: LayerEditorPropsT = $props()

	const NAME_LIMIT = 40
	const TIME_STEP = 0.1

	const isLogo = $derived(props.layer.kind === 'logo')
	const isText = $derived(props.layer.kind === 'text')
	const isSvg = $derived(props.layer.kind === 'svg')
	const textContent = $derived(props.layer.text)
	const hasTextContent = $derived(isText && textContent !== null)
	const hasFx = $derived(props.layer.fx.length > 0)
	const canMoveForward = $derived(checkCanMove(props.layer.id, 'forward'))
	const canMoveBackward = $derived(checkCanMove(props.layer.id, 'backward'))
	const songLength = $derived(app.hasAudio ? app.duration : DEMO_LOOP_SECONDS)
	const endTimeValue = $derived(props.layer.endTime ?? songLength)
	const textWeightValue = $derived(textContent === null ? '900' : String(textContent.weight))
	const textColorValue = $derived(textContent === null ? 'foreground' : textContent.color)
	const textValue = $derived(textContent === null ? '' : textContent.text)
	const isUppercase = $derived(textContent === null ? false : textContent.isUppercase)

	const getIsMissingFile = (): boolean => {
		void layerStore.assetVersion
		const isAssetLayer = props.layer.kind === 'image' || props.layer.kind === 'svg'
		if (!isAssetLayer) return false
		return getAsset(props.layer.assetId) === null
	}

	const isMissingFile = $derived(getIsMissingFile())

	const readText = (event: Event): string => (event as CustomEvent<{ value: string }>).detail.value

	const readNumber = (event: Event): number => (event as CustomEvent<{ value: number }>).detail.value

	const handleNameChange = (event: Event) => {
		const name = readText(event).slice(0, NAME_LIMIT)
		const isBlank = name.trim().length === 0
		if (isBlank) return
		props.layer.name = name
	}

	const handleTextChange = (event: Event) => {
		const content = props.layer.text
		if (content === null) return
		content.text = readText(event)
	}

	const handleWeightChange = (value: string) => {
		const content = props.layer.text
		if (content === null) return
		content.weight = Number(value) as TextWeightT
	}

	const handleUppercaseChange = (event: Event) => {
		const content = props.layer.text
		if (content === null) return
		const detail = (event as CustomEvent<{ checked: boolean }>).detail
		content.isUppercase = detail.checked
	}

	const handleTextColorChange = (event: Event) => {
		const content = props.layer.text
		if (content === null) return
		content.color = readText(event) as PaletteSlotT
	}

	const handleSvgColorChange = (event: Event) => {
		props.layer.svgColor = readText(event) as SvgColorT
	}

	const handleBlendChange = (event: Event) => {
		props.layer.blend = readText(event) as BlendModeT
	}

	const handleStartChange = (event: Event) => {
		const value = readNumber(event)
		const isNumber = Number.isFinite(value)
		if (!isNumber) return
		const latestStart = Math.max(0, endTimeValue - TIME_STEP)
		props.layer.startTime = Math.min(Math.max(0, value), latestStart)
	}

	// Reaching the song's end means "run to the end", so the
	// layer keeps going if a longer song is loaded later.
	const handleEndChange = (event: Event) => {
		const value = readNumber(event)
		const isNumber = Number.isFinite(value)
		if (!isNumber) return
		const isAtSongEnd = value >= songLength - TIME_STEP / 2
		if (isAtSongEnd) {
			props.layer.endTime = null
			return
		}
		const earliestEnd = props.layer.startTime + TIME_STEP
		props.layer.endTime = Math.max(earliestEnd, value)
	}

	const handleAddFx = (kind: FxKindT) => addLayerFx(props.layer.id, kind)

	const handleRemoveFx = (fxId: string) => removeLayerFx(props.layer.id, fxId)

	const handleMoveForward = () => moveLayer(props.layer.id, 'forward')

	const handleMoveBackward = () => moveLayer(props.layer.id, 'backward')

	const handleDelete = () => removeLayer(props.layer.id)
</script>

<div class="layer-editor">
	<Section title="Layer">
		<div class="layer-editor-name">
			<z-input value={props.layer.name} aria-label="Layer name" onchange={handleNameChange}></z-input>
			<z-button-group>
				<z-tooltip content="Bring forward" placement="top" openDelay={300}>
					<z-button size="md" kind="outline" tone="neutral" aria-label="Bring forward" isDisabled={!canMoveForward} onclick={handleMoveForward}>
						<CaretUpIcon weight="bold" />
					</z-button>
				</z-tooltip>
				<z-tooltip content="Send backward" placement="top" openDelay={300}>
					<z-button size="md" kind="outline" tone="neutral" aria-label="Send backward" isDisabled={!canMoveBackward} onclick={handleMoveBackward}>
						<CaretDownIcon weight="bold" />
					</z-button>
				</z-tooltip>
			</z-button-group>
		</div>

		{#if isMissingFile}
			<p class="layer-editor-note isWarning">This layer's file could not be restored. Remove it and add the file again.</p>
		{/if}

		{#if hasTextContent}
			<z-textarea value={textValue} rows={2} isAutoResize aria-label="Text" oninput={handleTextChange} onchange={handleTextChange}></z-textarea>
			<Segmented label="Weight" options={TEXT_WEIGHT_OPTIONS} value={textWeightValue} onchange={handleWeightChange} />
			<div class="layer-editor-pair">
				<z-select value={textColorValue} options={PALETTE_SLOT_OPTIONS} aria-label="Text color" onchange={handleTextColorChange}></z-select>
				<z-switch isChecked={isUppercase} size="sm" onchange={handleUppercaseChange}>Uppercase</z-switch>
			</div>
		{/if}

		{#if isSvg}
			<z-field label="Color">
				<z-select value={props.layer.svgColor} options={SVG_COLOR_OPTIONS} aria-label="Vector color" onchange={handleSvgColorChange}></z-select>
			</z-field>
		{/if}
	</Section>

	<Section title="Transform" description="Modulate any value to move it with the music.">
		{#each LAYER_PARAMS as param (param.key)}
			<LayerParamSlider layer={props.layer} paramKey={param.key} />
		{/each}
	</Section>

	<Section title="Blend and timing" description="Layers fade in and out over a quarter second at their edges.">
		<z-field label="Blend">
			<z-select value={props.layer.blend} options={BLEND_OPTIONS} aria-label="Blend mode" onchange={handleBlendChange}></z-select>
		</z-field>
		<div class="layer-editor-pair">
			<z-field label="Starts (s)">
				<z-number-input value={Number(props.layer.startTime.toFixed(2))} min={0} max={songLength} step={TIME_STEP} isFullWidth onchange={handleStartChange}></z-number-input>
			</z-field>
			<z-field label="Ends (s)">
				<z-number-input value={Number(endTimeValue.toFixed(2))} min={0} max={songLength} step={TIME_STEP} isFullWidth onchange={handleEndChange}></z-number-input>
			</z-field>
		</div>
	</Section>

	<Section title="Effects" description="Stacked in order. Each one can follow the music.">
		{#if hasFx}
			<div class="layer-editor-fx-list">
				{#each props.layer.fx as fx (fx.id)}
					<FxRow {fx} onremove={() => handleRemoveFx(fx.id)} />
				{/each}
			</div>
		{/if}
		<div class="layer-editor-fx-add" role="group" aria-label="Add an effect">
			{#each FX_SPECS as spec (spec.kind)}
				<button class="layer-editor-fx-chip" type="button" onclick={() => handleAddFx(spec.kind)}>
					<PlusIcon weight="bold" />
					{spec.label}
				</button>
			{/each}
		</div>
	</Section>

	{#if !isLogo}
		<Section title="Remove">
			<z-button size="md" kind="outline" tone="danger" isFullWidth onclick={handleDelete}>
				<TrashIcon weight="bold" />
				Delete layer
			</z-button>
		</Section>
	{/if}
</div>
