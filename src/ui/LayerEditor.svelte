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
	import { getVideo } from '../engine/video'
	import { BLEND_OPTIONS, FX_SPECS, TEXT_FONT_OPTIONS, getLayerParams } from '../engine/layers'
	import { DEMO_LOOP_SECONDS } from '../engine/settings'
	import type { BlendModeT, FxKindT, LayerT, ShapeFillT, ShapeKindT, TextFontT } from '../engine/types'
	import { palette } from '../palette.svelte'
	import {
		addLayerFx,
		checkCanMove,
		layerStore,
		moveLayer,
		removeLayer,
		removeLayerFx,
		renameLayer,
		setLayerImageFile
	} from '../layers.svelte'
	import { app } from '../store.svelte'
	import { formatPreciseTime } from '../engine/timeline'
	import ColorPicker from './ColorPicker.svelte'
	import FxRow from './FxRow.svelte'
	import LayerParamSlider from './LayerParamSlider.svelte'
	import { openPicturePicker } from './filePicker'
	import RenameField from './RenameField.svelte'
	import Section from './Section.svelte'
	import Segmented from './Segmented.svelte'
	import SettingSlider from './SettingSlider.svelte'
	import './ClipProperties.css'
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
	const isVideo = $derived(props.layer.kind === 'video')
	const hasFx = $derived(props.layer.fx.length > 0)
	const canMoveForward = $derived(checkCanMove(props.layer.id, 'forward'))
	const canMoveBackward = $derived(checkCanMove(props.layer.id, 'backward'))
	const songLength = $derived(app.hasAudio ? app.duration : DEMO_LOOP_SECONDS)
	const firstClip = $derived(props.layer.clips[0])
	const endTimeValue = $derived(props.layer.clips.reduce((latest, clip) => Math.max(latest, clip.endTime ?? songLength), 0))
	const isPicture = $derived(props.layer.kind === 'image' || props.layer.kind === 'svg')
	const hasPicture = $derived(props.layer.assetId !== null)

	// Every color the user has, to choose from. Changing a color in the
	// Palette changes it here and on the stage.
	const colorOptions = $derived(palette.colors.map((color) => ({ value: color.id, label: color.name })))
	const svgColorOptions = $derived([{ value: 'original', label: 'Original colors' }, ...colorOptions])

	const SHAPE_KIND_OPTIONS = [
		{ value: 'square', label: 'Square' },
		{ value: 'circle', label: 'Circle' }
	]

	const SHAPE_FILL_OPTIONS = [
		{ value: 'solid', label: 'Solid' },
		{ value: 'gradient', label: 'Gradient' }
	]

	const shape = $derived(props.layer.shape)
	const isGradient = $derived(shape !== null && shape.fill === 'gradient')

	const handleShapeKind = (event: Event) => {
		if (shape === null) return
		recordHistory()
		shape.kind = readText(event) as ShapeKindT
	}

	const handleShapeFill = (value: string) => {
		if (shape === null) return
		recordHistory()
		shape.fill = value as ShapeFillT
	}

	const handleShapeColor = (event: Event) => {
		if (shape === null) return
		recordHistory()
		shape.color = readText(event)
	}

	const handleShapeSecondColor = (event: Event) => {
		if (shape === null) return
		recordHistory()
		shape.color2 = readText(event)
	}

	const handleShapeAngle = (value: number) => {
		if (shape === null) return
		shape.angle = value
	}

	const getIsMissingFile = (): boolean => {
		void layerStore.assetVersion
		if (props.layer.assetId === null) return false
		if (props.layer.kind === 'video') return getVideo(props.layer.assetId) === null
		const isAssetLayer = props.layer.kind === 'image' || props.layer.kind === 'svg'
		if (!isAssetLayer) return false
		return getAsset(props.layer.assetId) === null
	}

	const isMissingFile = $derived(getIsMissingFile())

	const readText = (event: Event): string => (event as CustomEvent<{ value: string }>).detail.value

	const showName = $derived(props.showName ?? true)

	const handleNameCommit = (name: string) => renameLayer(props.layer.id, name)

	const handleUpload = () => openPicturePicker((file) => void setLayerImageFile(props.layer.id, file))

	const handleSvgColorChange = (event: Event) => {
		recordHistory()
		props.layer.svgColor = readText(event)
	}

	const handleBlendChange = (event: Event) => {
		recordHistory()
		props.layer.blend = readText(event) as BlendModeT
	}

	const timingLabel = $derived(`${formatPreciseTime(firstClip?.startTime ?? 0)} – ${formatPreciseTime(endTimeValue)}`)
	const timingDescription = $derived(
		app.hasAudio
			? `Shows ${timingLabel}. Drag its bar in the timeline to change when.`
			: 'Load a song to set when this layer shows.'
	)

	const handleAddFx = (kind: FxKindT) => addLayerFx(props.layer.id, kind)

	const handleRemoveFx = (fxId: string) => removeLayerFx(props.layer.id, fxId)

	const handleMoveForward = () => moveLayer(props.layer.id, 'forward')

	const handleMoveBackward = () => moveLayer(props.layer.id, 'backward')

	const handleDelete = () => removeLayer(props.layer.id)

	type StyleKeyT = 'isStrike' | 'isUnderline' | 'isItalic' | 'isUppercase' | 'isLowercase'
	const MIN_WEIGHT = 100
	const MAX_WEIGHT = 1000
	const WEIGHT_STEP = 50

	const handleLayerFont = (event: Event) => {
		if (props.layer.text === null) return
		recordHistory()
		props.layer.text.font = readText(event) as TextFontT
	}

	const handleLayerWeight = (event: Event) => {
		if (props.layer.text === null) return
		const value = Number((event as CustomEvent<{ value: number }>).detail.value)
		if (!Number.isFinite(value)) return
		recordHistoryCoalesced(`layer-weight:${props.layer.id}`)
		props.layer.text.weight = String(Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, Math.round(value))))
		console.log('set weight ', props.layer.text.weight)
	}

	const handleLayerTextColor = (value: string, isContinuous: boolean) => {
		if (props.layer.text === null) return
		if (isContinuous) recordHistoryCoalesced(`layer-text-color:${props.layer.id}`)
		else recordHistory()
		props.layer.text.color = value
	}

	const handleLayerStyleToggle = (key: StyleKeyT) => {
		if (props.layer.text === null) return
		recordHistory()
		const next = !props.layer.text[key]
		props.layer.text[key] = next
		if (key === 'isUppercase' && next) props.layer.text.isLowercase = false
		if (key === 'isLowercase' && next) props.layer.text.isUppercase = false
	}

	const getStyleButtonKind = (isOn: boolean): string => (isOn ? 'soft' : 'outline')
	const getStyleButtonTone = (isOn: boolean): string => (isOn ? 'primary' : 'neutral')
</script>

<div class="layer-editor">
	{#if isText && props.layer.text !== null}
		<Section title="Typography" description="Default style inherited by clips on this layer unless overridden.">
			<z-field label="Font" is-horizontal>
				<z-select
					value={props.layer.text.font ?? 'dm-sans'}
					options={TEXT_FONT_OPTIONS}
					aria-label="Font family"
					onchange={handleLayerFont}
				></z-select>
			</z-field>
			<z-field label="Weight" is-horizontal>
				<z-number-input
					value={Number(props.layer.text.weight)}
					min={MIN_WEIGHT}
					max={MAX_WEIGHT}
					step={WEIGHT_STEP}
					size="md"
					aria-label="Font weight"
					oninput={handleLayerWeight}
					onchange={handleLayerWeight}
					has-stepper-buttons
				></z-number-input>
			</z-field>
			<ColorPicker value={props.layer.text.color} label="Text color" onchange={handleLayerTextColor} />

			<div class="layer-editor-styles clip-properties-styles" role="group" aria-label="Text style">
				<z-button
					size="sm"
					kind={getStyleButtonKind(props.layer.text.isStrike)}
					tone={getStyleButtonTone(props.layer.text.isStrike)}
					aria-label="Strike-through"
					aria-pressed={props.layer.text.isStrike}
					onclick={() => handleLayerStyleToggle('isStrike')}
				>
					<TextStrikethroughIcon weight="bold" />
				</z-button>
				<z-button
					size="sm"
					kind={getStyleButtonKind(props.layer.text.isUnderline)}
					tone={getStyleButtonTone(props.layer.text.isUnderline)}
					aria-label="Underline"
					aria-pressed={props.layer.text.isUnderline}
					onclick={() => handleLayerStyleToggle('isUnderline')}
				>
					<TextUnderlineIcon weight="bold" />
				</z-button>
				<z-button
					size="sm"
					kind={getStyleButtonKind(props.layer.text.isItalic)}
					tone={getStyleButtonTone(props.layer.text.isItalic)}
					aria-label="Italic"
					aria-pressed={props.layer.text.isItalic}
					onclick={() => handleLayerStyleToggle('isItalic')}
				>
					<TextItalicIcon weight="bold" />
				</z-button>
				<span class="clip-properties-case">
					<z-button
						size="sm"
						kind={getStyleButtonKind(props.layer.text.isUppercase)}
						tone={getStyleButtonTone(props.layer.text.isUppercase)}
						aria-label="All caps"
						aria-pressed={props.layer.text.isUppercase}
						onclick={() => handleLayerStyleToggle('isUppercase')}>AA</z-button
					>
					<z-button
						size="sm"
						kind={getStyleButtonKind(props.layer.text.isLowercase)}
						tone={getStyleButtonTone(props.layer.text.isLowercase)}
						aria-label="All lower case"
						aria-pressed={props.layer.text.isLowercase}
						onclick={() => handleLayerStyleToggle('isLowercase')}>aa</z-button
					>
				</span>
			</div>
		</Section>
	{/if}

	<Section title="Transform" description="Modulate any value to move it with the music.">
		{#each getLayerParams(props.layer.kind) as param (param.key)}
			<LayerParamSlider layer={props.layer} paramKey={param.key} />
		{/each}
	</Section>

	<Section title="Blend and timing" description={timingDescription}>
		<z-field label="Blend">
			<z-select value={props.layer.blend} options={BLEND_OPTIONS} aria-label="Blend mode" onchange={handleBlendChange}
			></z-select>
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
				<z-button size="sm" kind="outline" tone="neutral" onclick={() => handleAddFx(spec.kind)}>
					<PlusIcon weight="bold" />
					{spec.label}
				</z-button>
			{/each}
		</div>
	</Section>
</div>
