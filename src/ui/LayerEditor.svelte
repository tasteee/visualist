<script lang="ts">
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon'
	import CaretUpIcon from 'phosphor-svelte/lib/CaretUpIcon'
	import TextItalicIcon from 'phosphor-svelte/lib/TextItalicIcon'
	import TextStrikethroughIcon from 'phosphor-svelte/lib/TextStrikethroughIcon'
	import TextUnderlineIcon from 'phosphor-svelte/lib/TextUnderlineIcon'
	import UploadSimpleIcon from 'phosphor-svelte/lib/UploadSimpleIcon'
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon'
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon'
	import { recordHistory, recordHistoryCoalesced } from '../automation.svelte'
	import { getAsset } from '../engine/assets'
	import { BLEND_OPTIONS, FX_SPECS, LAYER_PARAMS, PALETTE_SLOT_OPTIONS, SVG_COLOR_OPTIONS, TEXT_WEIGHT_OPTIONS } from '../engine/layers'
	import { DEMO_LOOP_SECONDS } from '../engine/settings'
	import type { BlendModeT, FxKindT, LayerT, PaletteSlotT, SvgColorT, TextWeightT } from '../engine/types'
	import { addLayerFx, checkCanMove, layerStore, moveLayer, removeLayer, removeLayerFx, renameLayer, setLayerImageFile } from '../layers.svelte'
	import { app } from '../store.svelte'
	import { formatPreciseTime } from '../engine/timeline'
	import FxRow from './FxRow.svelte'
	import LayerParamSlider from './LayerParamSlider.svelte'
	import { openPicturePicker } from './filePicker'
	import RenameField from './RenameField.svelte'
	import Section from './Section.svelte'
	import Segmented from './Segmented.svelte'
	import './LayerEditor.css'

	type LayerEditorPropsT = {
		layer: LayerT
		// The inspector popover has its own name field.
		showName?: boolean
	}

	const props: LayerEditorPropsT = $props()

	const NAME_LIMIT = 40

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
	const isPicture = $derived(props.layer.kind === 'image' || props.layer.kind === 'svg')
	const hasPicture = $derived(props.layer.assetId !== null)

	const FONT_OPTIONS = [{ value: 'dm-sans', label: 'DM Sans' }]

	const getIsMissingFile = (): boolean => {
		void layerStore.assetVersion
		const isAssetLayer = props.layer.kind === 'image' || props.layer.kind === 'svg'
		if (!isAssetLayer || props.layer.assetId === null) return false
		return getAsset(props.layer.assetId) === null
	}

	const isMissingFile = $derived(getIsMissingFile())

	const readText = (event: Event): string => (event as CustomEvent<{ value: string }>).detail.value

	const showName = $derived(props.showName ?? true)

	const handleNameCommit = (name: string) => renameLayer(props.layer.id, name)

	const handleTextChange = (event: Event) => {
		const content = props.layer.text
		if (content === null) return
		recordHistoryCoalesced(`layer-text:${props.layer.id}`)
		content.text = readText(event)
	}

	const handleWeightChange = (value: string) => {
		const content = props.layer.text
		if (content === null) return
		recordHistory()
		content.weight = Number(value) as TextWeightT
	}

	type TextStyleKeyT = 'isStrike' | 'isUnderline' | 'isItalic' | 'isUppercase' | 'isLowercase'

	const isStrike = $derived(textContent === null ? false : textContent.isStrike)
	const isUnderline = $derived(textContent === null ? false : textContent.isUnderline)
	const isItalic = $derived(textContent === null ? false : textContent.isItalic)
	const isLowercase = $derived(textContent === null ? false : textContent.isLowercase)

	// Caps and lower case are alternatives, so turning one on
	// turns the other off.
	const handleStyleToggle = (key: TextStyleKeyT) => {
		const content = props.layer.text
		if (content === null) return
		recordHistory()
		const nextValue = !content[key]
		content[key] = nextValue
		if (key === 'isUppercase' && nextValue) content.isLowercase = false
		if (key === 'isLowercase' && nextValue) content.isUppercase = false
	}

	const handleUpload = () => openPicturePicker((file) => void setLayerImageFile(props.layer.id, file))

	const handleTextColorChange = (event: Event) => {
		const content = props.layer.text
		if (content === null) return
		recordHistory()
		content.color = readText(event) as PaletteSlotT
	}

	const handleSvgColorChange = (event: Event) => {
		recordHistory()
		props.layer.svgColor = readText(event) as SvgColorT
	}

	const handleBlendChange = (event: Event) => {
		recordHistory()
		props.layer.blend = readText(event) as BlendModeT
	}

	const timingLabel = $derived(`${formatPreciseTime(props.layer.startTime)} – ${formatPreciseTime(endTimeValue)}`)
	const timingDescription = $derived(app.hasAudio ? `Shows ${timingLabel}. Drag its bar in the timeline to change when.` : 'Load a song to set when this layer shows.')

	const handleAddFx = (kind: FxKindT) => addLayerFx(props.layer.id, kind)

	const handleRemoveFx = (fxId: string) => removeLayerFx(props.layer.id, fxId)

	const handleMoveForward = () => moveLayer(props.layer.id, 'forward')

	const handleMoveBackward = () => moveLayer(props.layer.id, 'backward')

	const handleDelete = () => removeLayer(props.layer.id)
</script>

<div class="layer-editor">
	<Section title="Layer">
		<div class="layer-editor-name">
			{#if showName}
				<RenameField value={props.layer.name} label="Layer name" limit={NAME_LIMIT} oncommit={handleNameCommit} />
			{/if}
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
			<p class="layer-editor-note isWarning">This layer's file could not be restored. Upload it again.</p>
		{/if}

		{#if hasTextContent}
			<z-textarea value={textValue} rows={2} isAutoResize aria-label="Text" oninput={handleTextChange} onchange={handleTextChange}></z-textarea>
			<Segmented label="Weight" options={TEXT_WEIGHT_OPTIONS} value={textWeightValue} onchange={handleWeightChange} />
			<div class="layer-editor-pair">
				<z-select value={textColorValue} options={PALETTE_SLOT_OPTIONS} aria-label="Text color" onchange={handleTextColorChange}></z-select>
				<z-select value="dm-sans" options={FONT_OPTIONS} isDisabled aria-label="Font"></z-select>
			</div>
			<div class="layer-editor-styles" role="group" aria-label="Text style">
				<z-button size="sm" kind={isStrike ? 'soft' : 'outline'} tone={isStrike ? 'primary' : 'neutral'} aria-label="Strike-through" aria-pressed={isStrike} onclick={() => handleStyleToggle('isStrike')}>
					<TextStrikethroughIcon weight="bold" />
				</z-button>
				<z-button size="sm" kind={isUnderline ? 'soft' : 'outline'} tone={isUnderline ? 'primary' : 'neutral'} aria-label="Underline" aria-pressed={isUnderline} onclick={() => handleStyleToggle('isUnderline')}>
					<TextUnderlineIcon weight="bold" />
				</z-button>
				<z-button size="sm" kind={isItalic ? 'soft' : 'outline'} tone={isItalic ? 'primary' : 'neutral'} aria-label="Italic" aria-pressed={isItalic} onclick={() => handleStyleToggle('isItalic')}>
					<TextItalicIcon weight="bold" />
				</z-button>
				<z-button size="sm" kind={isUppercase ? 'soft' : 'outline'} tone={isUppercase ? 'primary' : 'neutral'} aria-label="All caps" aria-pressed={isUppercase} onclick={() => handleStyleToggle('isUppercase')}>AA</z-button>
				<z-button size="sm" kind={isLowercase ? 'soft' : 'outline'} tone={isLowercase ? 'primary' : 'neutral'} aria-label="All lower case" aria-pressed={isLowercase} onclick={() => handleStyleToggle('isLowercase')}>aa</z-button>
			</div>
		{/if}

		{#if isPicture}
			<z-button size="md" kind="outline" tone="neutral" isFullWidth isDisabled={layerStore.isImporting} onclick={handleUpload}>
				<UploadSimpleIcon weight="bold" />
				{hasPicture ? 'Replace picture' : 'Upload a picture'}
			</z-button>
			<p class="layer-editor-note">PNG, JPG, SVG, WebP or GIF. A new picture goes on top of every other layer.</p>
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

	<Section title="Blend and timing" description={timingDescription}>
		<z-field label="Blend">
			<z-select value={props.layer.blend} options={BLEND_OPTIONS} aria-label="Blend mode" onchange={handleBlendChange}></z-select>
		</z-field>
	</Section>

	<Section title="Effects" description="Stacked in order. Each one can follow the music.">
		{#if hasFx}
			<div class="layer-editor-fx-list">
				{#each props.layer.fx as fx (fx.id)}
					<FxRow layerId={props.layer.id} {fx} onremove={() => handleRemoveFx(fx.id)} />
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
