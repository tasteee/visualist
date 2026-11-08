<script lang="ts">
	import EraserIcon from 'phosphor-svelte/lib/EraserIcon'
	import { automation, recordHistory, recordHistoryCoalesced, renameLane, resetLane } from '../automation.svelte'
	import { getLaneColor, getRowColor, setRowColor } from '../appearance.svelte'
	import { getTargetControl } from '../engine/automation'
	import { PALETTE, getRoleColor, pickColorForId } from '../engine/palette'
	import { shadowStyles } from '../shadowStyles'
	import type { ColorNameT } from '../engine/palette'
	import type { AutomationLaneT, ClipT, ImpulseTrackT, LayerT } from '../engine/types'
	import { getSelectedClip, getSelectedLayer, layerStore, renameLayer } from '../layers.svelte'
	import { mappingsStore } from '../mappings.svelte'
	import { findTrack, renameTrack } from '../sources.svelte'
	import AudioControls from './AudioControls.svelte'
	import ClipProperties from './ClipProperties.svelte'
	import ImpulseTrackControls from './ImpulseTrackControls.svelte'
	import InspectorTitle from './InspectorTitle.svelte'
	import LayerEditor from './LayerEditor.svelte'
	import ModulatorMappings from './ModulatorMappings.svelte'
	import Section from './Section.svelte'
	import './ClipProperties.css'
	import './InspectorPanel.css'
	import './RowInspector.css'

	// Docked on the left of the workspace. A clip picked on its own shows
	// its properties. Otherwise a selected layer shows its own. Picking a
	// clip never picks its layer, so only one of the two shows.
	const pickedClip = $derived(getSelectedClip())
	const layer = $derived(getSelectedLayer())
	const selectedModulator = $derived(mappingsStore.selectedModulator)
	const selectedEmitter = $derived(selectedModulator?.kind === 'emitter' ? findTrack(selectedModulator.trackId) : undefined)
	const selectedLane = $derived(
		selectedModulator?.kind === 'lane'
			? automation.lanes.find((candidate) => candidate.id === selectedModulator.laneId)
			: undefined
	)

	const KIND_LABELS: Record<string, string> = {
		text: 'Text',
		image: 'Image',
		svg: 'Vector',
		video: 'Video',
		audio: 'Audio',
		shape: 'Shape',
		logo: 'Logo'
	}

	const readText = (event: Event): string => (event as CustomEvent<{ value: string }>).detail.value

	// An empty name hands the clip back to its fallback.
	const renameClip = (clip: ClipT, name: string) => {
		if (name === clip.name) return
		recordHistory()
		clip.name = name
	}

	const handleText = (event: Event, clip: ClipT) => {
		recordHistoryCoalesced(`clip-text:${clip.id}`)
		clip.text = readText(event)
	}

	// Picking a color sets it. A clip always has one once picked.
	const handleClipColor = (clip: ClipT, color: ColorNameT) => {
		if (clip.color === color) return
		recordHistory()
		clip.color = color
	}

	// Steps through the palette and wraps around, starting from the color
	// shown now, which is the layer's while the clip has none of its own.
	const handleCycleColor = (clip: ClipT, layerTone: ColorNameT) => {
		recordHistory()
		const current = clip.color ?? layerTone
		const index = PALETTE.findIndex((option) => option.name === current)
		clip.color = PALETTE[(index + 1) % PALETTE.length].name
	}

	// z-text sets its own color inside its shadow root, so let the
	// host's color through.
	const TEXT_CSS = '.text { color: inherit !important; font-weight: inherit !important; }'

	// The textarea's own look lives in its shadow root.
	const TEXTAREA_CSS = `
		.field { color: var(--color-neutral-0); font-size: 16px; font-weight: 500; letter-spacing: 0.5px; border-color: var(--color-neutral-3) !important; }
		.field:hover { border-color: var(--color-neutral-5); }
		.field.is-focused { background: color-mix(in srgb, var(--color-neutral-5) 5%, transparent); border-color: var(--color-neutral-3) !important; }
		.field:focus-within { border-color: var(--color-neutral-3) !important; outline-offset: 0px; background: color-mix(in srgb, var(--color-neutral-5) 20%, transparent); outline: 0px solid var(--color-neutral-5); }
		/* The typed text itself (.inspector-panel-header-textarea-text). */
		textarea { font-weight: 600 !important; color: var(--color-neutral-0); font-size: 16px; }
	`

	// A layer's color is its row color, or the one its id picks.
	const getLayerTone = (target: LayerT): ColorNameT => getRowColor(target.id, pickColorForId(target.id))

	const handleCycleLayerColor = (target: LayerT) => {
		recordHistory()
		const index = PALETTE.findIndex((option) => option.name === getLayerTone(target))
		setRowColor(target.id, PALETTE[(index + 1) % PALETTE.length].name)
	}

	const getKindLabel = (kind: string): string => KIND_LABELS[kind] ?? kind

	const getEmitterTone = (track: ImpulseTrackT): ColorNameT => getRowColor(track.id, getRoleColor(track.role))

	const handleCycleEmitterColor = (track: ImpulseTrackT) => {
		recordHistory()
		const index = PALETTE.findIndex((option) => option.name === getEmitterTone(track))
		setRowColor(track.id, PALETTE[(index + 1) % PALETTE.length].name)
	}

	const getLaneTone = (lane: AutomationLaneT): ColorNameT => getLaneColor(lane, layerStore.layers as LayerT[])

	const handleCycleLaneColor = (lane: AutomationLaneT) => {
		recordHistory()
		const index = PALETTE.findIndex((option) => option.name === getLaneTone(lane))
		setRowColor(lane.id, PALETTE[(index + 1) % PALETTE.length].name)
	}

	const getLaneDisplayName = (lane: AutomationLaneT): string => {
		const control = getTargetControl(lane.target, layerStore.layers as LayerT[])
		return lane.name ?? control?.label ?? 'Automation'
	}
</script>

{#if pickedClip !== undefined}
	{@const clipTitle = pickedClip.clip.name.trim() || pickedClip.layer.name}
	<aside
		class="inspector-panel"
		data-tone={pickedClip.clip.color ?? getLayerTone(pickedClip.layer)}
		aria-label="Clip properties"
	>
		<header class="inspector-panel-header">
			<div class="inspector-panel-meta">
				<button
					class="inspector-panel-cycle inspector-panel-header-swatch"
					type="button"
					data-tone={pickedClip.clip.color ?? getLayerTone(pickedClip.layer)}
					aria-label="Clip color: {pickedClip.clip.color ?? getLayerTone(pickedClip.layer)}. Click for the next color."
					title="Next color"
					onclick={() => handleCycleColor(pickedClip.clip, getLayerTone(pickedClip.layer))}
				></button>
				<z-text class="inspector-panel-header-clip-type-text" use:shadowStyles={TEXT_CSS} size="xs" tag="span" weight={1000}
					>{getKindLabel(pickedClip.layer.kind).toUpperCase()}</z-text
				>
				<z-text class="inspector-panel-header-clip-text" use:shadowStyles={TEXT_CSS} size="xs" tag="span" weight={800}
					>CLIP</z-text
				>
			</div>
			<InspectorTitle
				size="xs"
				value={clipTitle}
				label="Rename clip"
				oncommit={(name) => renameClip(pickedClip.clip, name)}
			/>
			<span style="display: flex; height: 4px"></span>
			{#if pickedClip.layer.kind === 'text'}
				<z-textarea
					class="inspector-panel-header-textarea"
					use:shadowStyles={TEXTAREA_CSS}
					spellcheck="false"
					value={pickedClip.clip.text}
					rows={2}
					isAutoResize
					aria-label="Text"
					oninput={(event: any) => handleText(event, pickedClip.clip)}
					onchange={(event: any) => handleText(event, pickedClip.clip)}
				></z-textarea>
			{/if}

			<div class="clip-properties-swatches inspector-panel-swatches" role="group" aria-label="Clip color">
				{#each PALETTE as option (option.name)}
					<button
						class="row-inspector-swatch"
						class:isActive={pickedClip.clip.color === option.name}
						type="button"
						data-tone={option.name}
						aria-label={option.label}
						aria-pressed={pickedClip.clip.color === option.name}
						title={option.label}
						onclick={() => handleClipColor(pickedClip.clip, option.name)}
					></button>
				{/each}
			</div>
		</header>
		<div class="inspector-panel-body">
			{#key pickedClip.clip.id}
				{@const foo = console.log({ pickedClip })}
				<ClipProperties layer={pickedClip.layer} clip={pickedClip?.clip} />
			{/key}
		</div>
	</aside>
{:else if layer !== undefined}
	<aside class="inspector-panel" data-tone={getLayerTone(layer)} aria-label="Layer properties">
		<header class="inspector-panel-header">
			<div class="inspector-panel-meta">
				<button
					class="inspector-panel-cycle inspector-panel-header-swatch"
					type="button"
					data-tone={getLayerTone(layer)}
					aria-label="Layer color: {getLayerTone(layer)}. Click for the next color."
					title="Next color"
					onclick={() => handleCycleLayerColor(layer)}
				></button>
				<z-text class="inspector-panel-header-clip-type-text" use:shadowStyles={TEXT_CSS} size="xs" tag="span">LAYER</z-text
				>
				<z-text class="inspector-panel-header-clip-text" use:shadowStyles={TEXT_CSS} size="xs" tag="span" weight={800}
					>{getKindLabel(layer.kind).toUpperCase()}</z-text
				>
			</div>
			<InspectorTitle size="xs" value={layer.name} label="Rename layer" oncommit={(name) => renameLayer(layer.id, name)} />
		</header>
		<div class="inspector-panel-body">
			{#key layer.id}
				{#if layer.kind === 'audio'}
					<AudioControls layerId={layer.id} />
				{:else}
					<LayerEditor {layer} />
				{/if}
			{/key}
		</div>
	</aside>
{:else if selectedEmitter !== undefined}
	{@const emitterTone = getEmitterTone(selectedEmitter)}
	<aside class="inspector-panel" data-tone={emitterTone} aria-label="Emitter properties">
		<header class="inspector-panel-header">
			<div class="inspector-panel-meta">
				<button
					class="inspector-panel-cycle inspector-panel-header-swatch"
					type="button"
					data-tone={emitterTone}
					aria-label="Emitter color: {emitterTone}. Click for the next color."
					title="Next color"
					onclick={() => handleCycleEmitterColor(selectedEmitter)}
				></button>
				<z-text class="inspector-panel-header-clip-type-text" use:shadowStyles={TEXT_CSS} size="xs" tag="span"
					>MODULATOR</z-text
				>
				<z-text class="inspector-panel-header-clip-text" use:shadowStyles={TEXT_CSS} size="xs" tag="span" weight={800}
					>EMITTER</z-text
				>
			</div>
			<InspectorTitle
				size="xs"
				value={selectedEmitter.name}
				label="Rename emitter"
				oncommit={(name) => renameTrack(selectedEmitter.id, name)}
			/>
		</header>
		<div class="inspector-panel-body">
			{#key selectedEmitter.id}
				<ModulatorMappings modulator={{ kind: 'emitter', trackId: selectedEmitter.id }} />
				<Section title="Emitter">
					<ImpulseTrackControls track={selectedEmitter} />
				</Section>
			{/key}
		</div>
	</aside>
{:else if selectedLane !== undefined}
	{@const laneTone = getLaneTone(selectedLane)}
	{@const laneTitle = getLaneDisplayName(selectedLane)}
	<aside class="inspector-panel" data-tone={laneTone} aria-label="Automation modulator properties">
		<header class="inspector-panel-header">
			<div class="inspector-panel-meta">
				<button
					class="inspector-panel-cycle inspector-panel-header-swatch"
					type="button"
					data-tone={laneTone}
					aria-label="Lane color: {laneTone}. Click for the next color."
					title="Next color"
					onclick={() => handleCycleLaneColor(selectedLane)}
				></button>
				<z-text class="inspector-panel-header-clip-type-text" use:shadowStyles={TEXT_CSS} size="xs" tag="span"
					>MODULATOR</z-text
				>
				<z-text class="inspector-panel-header-clip-text" use:shadowStyles={TEXT_CSS} size="xs" tag="span" weight={800}
					>AUTOMATION</z-text
				>
			</div>
			<InspectorTitle
				size="xs"
				value={laneTitle}
				label="Rename automation lane"
				oncommit={(name) => renameLane(selectedLane.id, name)}
			/>
		</header>
		<div class="inspector-panel-body">
			{#key selectedLane.id}
				<ModulatorMappings modulator={{ kind: 'lane', laneId: selectedLane.id }} />
				<Section title="Curve">
					<z-button
						size="sm"
						kind="outline"
						tone="neutral"
						isFullWidth
						isDisabled={selectedLane.points.length <= 1}
						onclick={() => resetLane(selectedLane.id)}
					>
						<EraserIcon weight="bold" />
						Reset points
					</z-button>
				</Section>
			{/key}
		</div>
	</aside>
{/if}
