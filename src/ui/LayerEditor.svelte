<script lang="ts">
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon'
	import CaretUpIcon from 'phosphor-svelte/lib/CaretUpIcon'
	import UploadSimpleIcon from 'phosphor-svelte/lib/UploadSimpleIcon'
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon'
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon'
	import { recordHistory, recordHistoryCoalesced } from '../automation.svelte'
	import { getAsset } from '../engine/assets'
	import { getVideo } from '../engine/video'
	import { BLEND_OPTIONS, FX_SPECS, TEXT_WEIGHT_OPTIONS, findClipAt, getLayerParams } from '../engine/layers'
	import { DEMO_LOOP_SECONDS } from '../engine/settings'
	import type { BlendModeT, FxKindT, LayerT, ShapeFillT, ShapeKindT, TextWeightT } from '../engine/types'
	import { palette } from '../palette.svelte'
	import { addLayerFx, checkCanMove, layerStore, moveLayer, removeLayer, removeLayerFx, renameLayer, setLayerImageFile } from '../layers.svelte'
	import { app } from '../store.svelte'
	import { formatPreciseTime } from '../engine/timeline'
	import FxRow from './FxRow.svelte'
	import LayerParamSlider from './LayerParamSlider.svelte'
	import { openPicturePicker } from './filePicker'
	import RenameField from './RenameField.svelte'
	import Section from './Section.svelte'
	import Segmented from './Segmented.svelte'
	import SettingSlider from './SettingSlider.svelte'
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

		{#if isVideo}
			<p class="layer-editor-note">Drag the clip in the timeline to move it. Drag its edges to trim. Video plays without sound.</p>
		{/if}

		{#if isPicture}
			<z-button size="md" kind="outline" tone="neutral" isFullWidth isDisabled={layerStore.isImporting} onclick={handleUpload}>
				<UploadSimpleIcon weight="bold" />
				{hasPicture ? 'Replace picture' : 'Upload a picture'}
			</z-button>
			<p class="layer-editor-note">PNG, JPG, SVG, WebP or GIF. A new picture goes on top of every other layer.</p>
		{/if}

		{#if shape !== null}
			<z-field label="Shape">
				<z-select value={shape.kind} options={SHAPE_KIND_OPTIONS} aria-label="Shape" onchange={handleShapeKind}></z-select>
			</z-field>
			<Segmented label="Fill" options={SHAPE_FILL_OPTIONS} value={shape.fill} onchange={handleShapeFill} />
			<z-field label={isGradient ? 'From' : 'Color'}>
				<z-select value={shape.color} options={colorOptions} aria-label="Shape color" onchange={handleShapeColor}></z-select>
			</z-field>
			{#if isGradient}
				<z-field label="To">
					<z-select value={shape.color2} options={colorOptions} aria-label="Gradient end color" onchange={handleShapeSecondColor}></z-select>
				</z-field>
				<SettingSlider label="Angle" value={shape.angle} min={0} max={360} step={1} suffix="°" onchange={handleShapeAngle} />
			{/if}
		{/if}

		{#if isSvg}
			<z-field label="Color">
				<z-select value={props.layer.svgColor} options={svgColorOptions} aria-label="Vector color" onchange={handleSvgColorChange}></z-select>
			</z-field>
		{/if}
	</Section>

	<Section title="Transform" description="Modulate any value to move it with the music.">
		{#each getLayerParams(props.layer.kind) as param (param.key)}
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
				<z-button size="sm" kind="outline" tone="neutral" onclick={() => handleAddFx(spec.kind)}>
					<PlusIcon weight="bold" />
					{spec.label}
				</z-button>
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
