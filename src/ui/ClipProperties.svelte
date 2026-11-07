<script lang="ts">
	import TextItalicIcon from 'phosphor-svelte/lib/TextItalicIcon'
	import TextStrikethroughIcon from 'phosphor-svelte/lib/TextStrikethroughIcon'
	import TextUnderlineIcon from 'phosphor-svelte/lib/TextUnderlineIcon'
	import { recordHistory, recordHistoryCoalesced } from '../automation.svelte'
	import { createClipTransform } from '../engine/layers'
	import { PALETTE } from '../engine/palette'
	import type { ColorNameT } from '../engine/palette'
	import type { ClipT, ClipTransformT, LayerT, TextContentT } from '../engine/types'
	import ColorPicker from './ColorPicker.svelte'
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
	const style = $derived<TextContentT | null>(props.layer.text === null ? null : { ...props.layer.text, ...props.clip.textStyle })

	// What the clip is called while it has no name of its own.
	const fallbackName = $derived(isText && props.clip.text.trim().length > 0 ? props.clip.text.replace(/\s+/g, ' ').trim() : props.layer.name)
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

	const handleWeight = (event: Event) => {
		const value = Number((event as CustomEvent<{ value: number }>).detail.value)
		if (!Number.isFinite(value)) return
		recordHistoryCoalesced(`clip-weight:${props.clip.id}`)
		props.clip.textStyle.weight = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, Math.round(value)))
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

	const getKind = (isOn: boolean): string => (isOn ? 'soft' : 'outline')
	const getTone = (isOn: boolean): string => (isOn ? 'primary' : 'neutral')
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

			<Section title="Typography">
				<z-select value="dm-sans" options={FONT_OPTIONS} isDisabled aria-label="Font family"></z-select>

				<div class="clip-properties-row">
					<span class="clip-properties-label">Weight</span>
					<z-number-input value={style.weight} min={MIN_WEIGHT} max={MAX_WEIGHT} step={WEIGHT_STEP} size="sm" aria-label="Font weight" onchange={handleWeight}></z-number-input>
				</div>

				<ColorPicker value={style.color} label="Text color" onchange={handleTextColor} />

				<div class="layer-editor-styles clip-properties-styles" role="group" aria-label="Text style">
					<z-button size="sm" kind={getKind(style.isStrike)} tone={getTone(style.isStrike)} aria-label="Strike-through" aria-pressed={style.isStrike} onclick={() => handleToggle('isStrike')}>
						<TextStrikethroughIcon weight="bold" />
					</z-button>
					<z-button size="sm" kind={getKind(style.isUnderline)} tone={getTone(style.isUnderline)} aria-label="Underline" aria-pressed={style.isUnderline} onclick={() => handleToggle('isUnderline')}>
						<TextUnderlineIcon weight="bold" />
					</z-button>
					<z-button size="sm" kind={getKind(style.isItalic)} tone={getTone(style.isItalic)} aria-label="Italic" aria-pressed={style.isItalic} onclick={() => handleToggle('isItalic')}>
						<TextItalicIcon weight="bold" />
					</z-button>
					<span class="clip-properties-case">
						<z-button size="sm" kind={getKind(style.isUppercase)} tone={getTone(style.isUppercase)} aria-label="All caps" aria-pressed={style.isUppercase} onclick={() => handleToggle('isUppercase')}>AA</z-button>
						<z-button size="sm" kind={getKind(style.isLowercase)} tone={getTone(style.isLowercase)} aria-label="All lower case" aria-pressed={style.isLowercase} onclick={() => handleToggle('isLowercase')}>aa</z-button>
					</span>
				</div>
			</Section>
		{/if}
	{:else}
		<Section title="Transform">
			{#each TRANSFORM_SPECS as spec (spec.key)}
				<SettingSlider
					label={spec.label}
					value={props.clip.transform[spec.key]}
					min={spec.min}
					max={spec.max}
					step={spec.step}
					suffix={spec.suffix}
					onchange={(value: number) => handleTransform(spec.key, value)}
				/>
			{/each}
			<z-button size="sm" kind="outline" tone="neutral" isFullWidth onclick={handleResetTransform}>Reset transform</z-button>
		</Section>
	{/if}
</div>
