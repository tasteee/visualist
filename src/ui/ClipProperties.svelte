<script lang="ts">
	import TextItalicIcon from 'phosphor-svelte/lib/TextItalicIcon'
	import TextStrikethroughIcon from 'phosphor-svelte/lib/TextStrikethroughIcon'
	import TextUnderlineIcon from 'phosphor-svelte/lib/TextUnderlineIcon'
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon'
	import { getLaneColor, getRowColor } from '../appearance.svelte'
	import { automation, recordHistory, recordHistoryCoalesced, revealLane } from '../automation.svelte'
	import { FX_SPECS, TEXT_FONT_OPTIONS, TEXT_WEIGHT_OPTIONS, createClipTransform, createFx } from '../engine/layers'
	import { SHADER_EFFECT_KINDS } from '../engine/shaderEffects'
	import { evaluateMappedValue } from '../engine/mappings'
	import { PALETTE, getRoleColor } from '../engine/palette'
	import type { ColorNameT } from '../engine/palette'
	import type {
		ClipParamKeyT,
		ClipT,
		ClipTransformT,
		LayerT,
		MappingTargetT,
		TextContentT,
		TextFontT
	} from '../engine/types'
	import { layerStore } from '../layers.svelte'
	import { getMappingsForTarget } from '../mappings.svelte'
	import { pickEmitterTrack, pickLane } from '../selection.svelte'
	import { findTrack, sources } from '../sources.svelte'
	import { app } from '../store.svelte'
	import { setEditorMode } from '../timeline.svelte'
	import ColorPicker from './ColorPicker.svelte'
	import FxRow from './FxRow.svelte'
	import Section from './Section.svelte'
	import SettingSlider from './SettingSlider.svelte'
	import './ClipProperties.css'
	import './LayerEditor.css'
	import './RowInspector.css'

	// What one clip owns, in two tabs. Style: its name, color and, for
	// text, its words and look. Transform: how it moves and sizes on top
	// of its layer. Every change is one undo step, or one for a whole drag.
	type ClipPropertiesPropsT = {
		layer: LayerT
		clip: ClipT
	}

	type TabT = 'style' | 'transform'

	type TransformSpecT = {
		key: keyof ClipTransformT
		label: string
		min: number
		max: number
		step: number
		suffix: string
	}

	type StyleKeyT = 'isStrike' | 'isUnderline' | 'isItalic' | 'isUppercase' | 'isLowercase'

	const props: ClipPropertiesPropsT = $props()

	const NAME_LIMIT = 40
	const MIN_WEIGHT = 100
	const MAX_WEIGHT = 900
	const WEIGHT_STEP = 50

	const TRANSFORM_SPECS: TransformSpecT[] = [
		{ key: 'x', label: 'Position X', min: -100, max: 100, step: 1, suffix: '%' },
		{ key: 'y', label: 'Position Y', min: -100, max: 100, step: 1, suffix: '%' },
		{ key: 'scale', label: 'Scale', min: 0.05, max: 3, step: 0.05, suffix: '×' },
		{ key: 'rotation', label: 'Rotation', min: -180, max: 180, step: 1, suffix: '°' },
		{ key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01, suffix: '' }
	]

	const FONT_OPTIONS = [{ value: 'dm-sans', label: 'DM Sans' }]

	let tab = $state<TabT>('style')

	// Audio is heard, not seen, so it has no transform.
	const isAudio = $derived(props.layer.kind === 'audio')
	const isText = $derived(props.layer.kind === 'text' && props.layer.text !== null)
	const activeTab = $derived<TabT>(isAudio ? 'style' : tab)

	// The layer's look with this clip's changes on top.
	const style = $derived<TextContentT | null>(
		props.layer.text === null ? null : { ...props.layer.text, ...props.clip.textStyle }
	)

	// What the clip is called while it has no name of its own.
	const fallbackName = $derived(
		isText && props.clip.text.trim().length > 0 ? props.clip.text.replace(/\s+/g, ' ').trim() : props.layer.name
	)

	const readText = (event: Event): string => (event as CustomEvent<{ value: string }>).detail.value

	const handleName = (event: Event) => {
		const name = readText(event).trim()
		if (name === props.clip.name) return
		recordHistory()
		props.clip.name = name
	}

	const TABS = [
		{ value: 'style', label: 'Style' },
		{ value: 'transform', label: 'Transform' }
	]

	const handleTab = (event: Event) => {
		const value = (event as CustomEvent<{ value: string }>).detail.value
		if (value === 'style' || value === 'transform') tab = value
	}

	// Clicking the picked color again hands the clip back to its layer's.
	const handleClipColor = (color: ColorNameT) => {
		recordHistory()
		props.clip.color = props.clip.color === color ? null : color
	}

	const handleText = (event: Event) => {
		recordHistoryCoalesced(`clip-text:${props.clip.id}`)
		props.clip.text = readText(event)
	}

	const handleFont = (event: Event) => {
		recordHistory()
		props.clip.textStyle.font = readText(event) as TextFontT
	}

	const handleFadeIn = (value: number) => {
		recordHistoryCoalesced(`clip-fade-in:${props.clip.id}`)
		props.clip.fadeIn = Math.max(0, value)
	}

	const handleFadeOut = (value: number) => {
		recordHistoryCoalesced(`clip-fade-out:${props.clip.id}`)
		props.clip.fadeOut = Math.max(0, value)
	}

	const handleWeight = (event: Event) => {
		const value = Number((event as CustomEvent<{ value: number }>).detail.value)
		if (!Number.isFinite(value)) return
		recordHistoryCoalesced(`clip-weight:${props.clip.id}`)
		props.clip.textStyle.weight = String(Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, Math.round(value))))
	}

	const handleTextColor = (value: string, isContinuous: boolean) => {
		if (isContinuous) recordHistoryCoalesced(`clip-color:${props.clip.id}`)
		else recordHistory()
		props.clip.textStyle.color = value
	}

	// Caps and lower case are alternatives, so turning one on turns the
	// other off.
	const handleToggle = (key: StyleKeyT) => {
		if (style === null) return
		recordHistory()
		const next = !style[key]
		props.clip.textStyle[key] = next
		if (key === 'isUppercase' && next) props.clip.textStyle.isLowercase = false
		if (key === 'isLowercase' && next) props.clip.textStyle.isUppercase = false
	}

	const handleTransform = (key: keyof ClipTransformT, value: number) => {
		recordHistoryCoalesced(`clip-transform:${props.clip.id}:${key}`)
		props.clip.transform[key] = value
	}

	const handleResetTransform = () => {
		recordHistory()
		props.clip.transform = createClipTransform()
	}

	const handleAddFoil = () => {
		recordHistory()
		props.clip.fx = [...props.clip.fx, createFx('foil')]
	}

	const handleAddHexGlitch = () => {
		recordHistory()
		props.clip.fx = [...props.clip.fx, createFx('hexGlitch')]
	}

	const handleAddShader = (kind: (typeof SHADER_EFFECT_KINDS)[number]) => {
		recordHistory()
		props.clip.fx = [...props.clip.fx, createFx(kind)]
	}

	const shaderSpecs = FX_SPECS.filter((spec) => SHADER_EFFECT_KINDS.some((kind) => kind === spec.kind))

	const handleRemoveClipFx = (effectId: string) => {
		recordHistory()
		props.clip.fx = props.clip.fx.filter((effect) => effect.id !== effectId)
	}

	const hasClipFoil = $derived(props.clip.fx.some((effect) => effect.kind === 'foil'))
	const hasClipHexGlitch = $derived(props.clip.fx.some((effect) => effect.kind === 'hexGlitch'))

	const getKind = (isOn: boolean): string => (isOn ? 'soft' : 'outline')
	const getTone = (isOn: boolean): string => (isOn ? 'primary' : 'neutral')

	const getClipMappingTarget = (key: ClipParamKeyT): MappingTargetT => ({
		kind: 'clip',
		layerId: props.layer.id,
		clipId: props.clip.id,
		param: key
	})

	const getClipBadgeColor = (key: ClipParamKeyT): ColorNameT | null => {
		const active = getMappingsForTarget(getClipMappingTarget(key)).filter((mapping) => !mapping.isBypassed)
		const first = active[0]
		if (first === undefined) return null
		if (first.modulator.kind === 'emitter') {
			const track = findTrack(first.modulator.trackId)
			return track === undefined ? 'amber' : getRowColor(track.id, getRoleColor(track.role))
		}
		const laneId = first.modulator.kind === 'lane' ? first.modulator.laneId : ''
		const lane = automation.lanes.find((candidate) => candidate.id === laneId)
		return lane === undefined ? 'lavender' : getLaneColor(lane, layerStore.layers as LayerT[])
	}

	const getClipBadgeLabel = (key: ClipParamKeyT): string => {
		const active = getMappingsForTarget(getClipMappingTarget(key)).filter((mapping) => !mapping.isBypassed)
		const first = active[0]
		if (first === undefined) return 'Automated'
		if (first.modulator.kind === 'emitter') {
			const track = findTrack(first.modulator.trackId)
			return track?.name ?? 'Emitter'
		}
		const laneId = first.modulator.kind === 'lane' ? first.modulator.laneId : ''
		const lane = automation.lanes.find((candidate) => candidate.id === laneId)
		return lane?.name ?? 'Automation'
	}

	const getClipLiveValue = (spec: TransformSpecT): number => {
		const base = props.clip.transform[spec.key]
		const target = getClipMappingTarget(spec.key)
		const active = getMappingsForTarget(target).filter((mapping) => !mapping.isBypassed)
		if (active.length === 0) return base
		const modContext = { tracks: sources.tracks, lanes: automation.lanes }
		return evaluateMappedValue(base, spec.min, spec.max, target, active, modContext, props.clip, app.currentTime)
	}

	const handleRevealClipMapping = (key: ClipParamKeyT) => {
		const active = getMappingsForTarget(getClipMappingTarget(key)).filter((mapping) => !mapping.isBypassed)
		const first = active[0]
		if (first === undefined) return
		setEditorMode('modulation')
		if (first.modulator.kind === 'emitter') return pickEmitterTrack(first.modulator.trackId)
		pickLane(first.modulator.laneId, [first.modulator.laneId], { isRange: false, isToggle: false })
		revealLane(first.modulator.laneId)
	}
</script>

<div class="clip-properties" style="padding-top: 4px">
	<!-- <z-textarea value={props.clip.text} rows={2} isAutoResize spellcheck="false" aria-label="Text" oninput={handleText} onchange={handleText}></z-textarea> -->

	{#if !isAudio}
		<div class="clip-properties-tabs">
			<z-tabs is-fitted tabs={TABS} value={activeTab} aria-label="Clip properties" onchange={handleTab}></z-tabs>
		</div>
	{/if}

	{#if activeTab === 'style'}
		{#if isText && style !== null}
			<!-- <z-textarea value={props.clip.text} rows={2} isAutoResize aria-label="Text" oninput={handleText} onchange={handleText}></z-textarea> -->

			<z-field label="Font" is-horizontal size="sm">
				<z-select
					value={style.font ?? 'dm-sans'}
					options={TEXT_FONT_OPTIONS}
					aria-label="Font family"
					size="sm"
					onchange={handleFont}
				></z-select>
			</z-field>

			<z-field label="Weight" is-horizontal size="sm">
				<z-number-input
					value={Number(style.weight)}
					min={MIN_WEIGHT}
					max={MAX_WEIGHT}
					step={WEIGHT_STEP}
					size="sm"
					is-full-width
					aria-label="Font weight"
					oninput={handleWeight}
					onchange={handleWeight}
					has-stepper-buttons
				></z-number-input>
			</z-field>

			<z-field label="Color" is-horizontal size="sm">
				<ColorPicker value={style.color} label="Text color" onchange={handleTextColor} />
			</z-field>

			<z-row
				gap="1"
				alignsY="center"
				class="layer-editor-styles clip-properties-styles"
				role="group"
				aria-label="Text style"
			>
				<z-button
					size="sm"
					kind={getKind(style.isStrike)}
					tone={getTone(style.isStrike)}
					aria-label="Strike-through"
					aria-pressed={style.isStrike}
					onclick={() => handleToggle('isStrike')}
				>
					<TextStrikethroughIcon weight="bold" />
				</z-button>
				<z-button
					size="sm"
					kind={getKind(style.isUnderline)}
					tone={getTone(style.isUnderline)}
					aria-label="Underline"
					aria-pressed={style.isUnderline}
					onclick={() => handleToggle('isUnderline')}
				>
					<TextUnderlineIcon weight="bold" />
				</z-button>
				<z-button
					size="sm"
					kind={getKind(style.isItalic)}
					tone={getTone(style.isItalic)}
					aria-label="Italic"
					aria-pressed={style.isItalic}
					onclick={() => handleToggle('isItalic')}
				>
					<TextItalicIcon weight="bold" />
				</z-button>
				<z-button-group class="clip-properties-case">
					<z-button
						size="sm"
						kind={getKind(style.isUppercase)}
						tone={getTone(style.isUppercase)}
						aria-label="All caps"
						aria-pressed={style.isUppercase}
						onclick={() => handleToggle('isUppercase')}>AA</z-button
					>
					<z-button
						size="sm"
						kind={getKind(style.isLowercase)}
						tone={getTone(style.isLowercase)}
						aria-label="All lower case"
						aria-pressed={style.isLowercase}
						onclick={() => handleToggle('isLowercase')}>aa</z-button
					>
				</z-button-group>
			</z-row>
		{/if}

		<Section title="Fades">
			<SettingSlider
				label="Fade in"
				value={props.clip.fadeIn ?? 0}
				min={0}
				max={5}
				step={0.05}
				suffix=" s"
				onchange={handleFadeIn}
			/>
			<SettingSlider
				label="Fade out"
				value={props.clip.fadeOut ?? 0}
				min={0}
				max={5}
				step={0.05}
				suffix=" s"
				onchange={handleFadeOut}
			/>
		</Section>
		{#if !isAudio}
			<Section title="Clip effects">
				{#each props.clip.fx as effect (effect.id)}
					<FxRow
						layerId={props.layer.id}
						clipId={props.clip.id}
						fx={effect}
						onremove={() => handleRemoveClipFx(effect.id)}
					/>
				{/each}
				{#if !hasClipFoil}
					<z-button size="sm" kind="outline" tone="neutral" isFullWidth onclick={handleAddFoil}>
						<PlusIcon weight="bold" /> Holographic foil
					</z-button>
				{/if}
				{#if !hasClipHexGlitch}
					<z-button size="sm" kind="outline" tone="neutral" isFullWidth onclick={handleAddHexGlitch}>
						<PlusIcon weight="bold" /> Hex glitch
					</z-button>
				{/if}
				{#each shaderSpecs as shaderSpec (shaderSpec.kind)}
					{@const isAdded = props.clip.fx.some((effect) => effect.kind === shaderSpec.kind)}
					{#if !isAdded}
						<z-button
							size="sm"
							kind="outline"
							tone="neutral"
							isFullWidth
							onclick={() => handleAddShader(shaderSpec.kind as (typeof SHADER_EFFECT_KINDS)[number])}
						>
							<PlusIcon weight="bold" />
							{shaderSpec.label}
						</z-button>
					{/if}
				{/each}
			</Section>
		{/if}
	{:else}
		<Section title="Transform">
			{#each TRANSFORM_SPECS as spec (spec.key)}
				<SettingSlider
					label={spec.label}
					value={props.clip.transform[spec.key]}
					liveValue={getClipLiveValue(spec)}
					min={spec.min}
					max={spec.max}
					step={spec.step}
					suffix={spec.suffix}
					automationColor={getClipBadgeColor(spec.key)}
					automationBadgeLabel={getClipBadgeLabel(spec.key)}
					onreveal={() => handleRevealClipMapping(spec.key)}
					onchange={(value: number) => handleTransform(spec.key, value)}
				/>
			{/each}
			<z-button size="sm" kind="outline" tone="neutral" isFullWidth onclick={handleResetTransform}>Reset transform</z-button
			>
		</Section>
	{/if}
</div>
