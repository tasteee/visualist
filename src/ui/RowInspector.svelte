<script lang="ts">
	import EraserIcon from 'phosphor-svelte/lib/EraserIcon'
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon'
	import { getRowColor, setRowColor } from '../appearance.svelte'
	import {
		automation,
		recordHistory,
		removeLane,
		renameLane,
		resetLane,
		setLaneTarget
	} from '../automation.svelte'
	import {
		GLOBAL_GROUP_ID,
		checkIsSameTarget,
		getTargetControl,
		getTargetGroupId,
		getTargetId,
		getTargetTone,
		listLayerTargets,
		listSettingTargets
	} from '../engine/automation'
	import { PALETTE, getRoleColor, getToneColor, pickColorForId } from '../engine/palette'
	import type { ColorNameT } from '../engine/palette'
	import type { LaneTargetT, LayerT } from '../engine/types'
	import { findLayer, layerStore, removeLayer, renameLayer } from '../layers.svelte'
	import { closeRowInspector, rowInspector } from '../rowInspector.svelte'
	import { findBand, findTrack, removeBand, removeTrack, renameBand, renameTrack } from '../sources.svelte'
	import { AUDIO_ROW_ID } from '../appearance.svelte'
	import { focusShell } from './focus'
	import BandControls from './BandControls.svelte'
	import HitTrackControls from './HitTrackControls.svelte'
	import LayerEditor from './LayerEditor.svelte'
	import RenameField from './RenameField.svelte'
	import './RowInspector.css'

	// One popover for every row. It stays open while sliders are
	// dragged, closes on a click away or Escape, and hands focus
	// back to the editor so Space still plays.
	const MARGIN = 8
	const GAP = 8

	let root = $state<HTMLDivElement | undefined>(undefined)

	const open = $derived(rowInspector.open)
	const layers = $derived(layerStore.layers as LayerT[])

	const layer = $derived(open !== null && open.kind === 'layer' ? findLayer(open.rowId) : undefined)
	const lane = $derived(open !== null && open.kind === 'lane' ? automation.lanes.find((candidate) => candidate.id === open.rowId) : undefined)
	const track = $derived(open !== null && open.kind === 'impulse' ? findTrack(open.rowId) : undefined)
	const band = $derived(open !== null && open.kind === 'band' ? findBand(open.rowId) : undefined)

	// The row is gone, for example after an undo.
	const isRowMissing = $derived.by(() => {
		if (open === null) return false
		if (open.kind === 'layer') return layer === undefined
		if (open.kind === 'lane') return lane === undefined
		if (open.kind === 'impulse') return track === undefined
		if (open.kind === 'band') return band === undefined
		return false
	})

	const control = $derived(lane === undefined ? null : getTargetControl(lane.target, layers))
	const controlLabel = $derived(control === null ? 'No control' : control.label)

	const eyebrow = $derived.by(() => {
		if (open === null) return ''
		if (open.kind === 'layer') return 'Layer'
		if (open.kind === 'lane') return 'Automation lane'
		if (open.kind === 'impulse') return 'Impulse lane'
		if (open.kind === 'band') return 'Band lane'
		if (open.kind === 'audio') return 'Audio'
		return 'Scene and post'
	})

	const canRename = $derived(open !== null && (open.kind === 'layer' || open.kind === 'lane' || open.kind === 'impulse' || open.kind === 'band'))

	const currentName = $derived.by(() => {
		if (layer !== undefined) return layer.name
		if (lane !== undefined) return lane.name ?? controlLabel
		if (track !== undefined) return track.name
		if (band !== undefined) return band.name
		return ''
	})

	const defaultColor = $derived.by((): ColorNameT => {
		if (open === null) return 'slate'
		if (layer !== undefined) return pickColorForId(layer.id)
		if (lane !== undefined) return getToneColor(getTargetTone(lane.target, layers))
		if (track !== undefined) return getRoleColor(track.role)
		if (open.kind === 'band') return 'amber'
		if (open.kind === 'audio') return 'amber'
		return 'slate'
	})

	const rowColorId = $derived(open === null ? '' : open.kind === 'audio' ? AUDIO_ROW_ID : open.kind === 'global' ? GLOBAL_GROUP_ID : open.rowId)
	const currentColor = $derived(getRowColor(rowColorId, defaultColor))

	// A lane can switch to any free control in its own group.
	const groupTargets = $derived.by((): LaneTargetT[] => {
		if (lane === undefined) return []
		const groupId = getTargetGroupId(lane.target)
		const isGlobal = groupId === GLOBAL_GROUP_ID
		if (isGlobal) return listSettingTargets()
		const groupLayer = findLayer(groupId)
		if (groupLayer === undefined) return []
		return listLayerTargets(groupLayer)
	})

	const targetOptions = $derived.by(() => {
		if (lane === undefined) return []
		const otherLanes = automation.lanes.filter((candidate) => candidate.id !== lane.id)
		return groupTargets.map((target) => {
			const targetControl = getTargetControl(target, layers)
			const isUsed = otherLanes.some((candidate) => checkIsSameTarget(candidate.target, target))
			return { value: getTargetId(target), label: targetControl === null ? 'Missing' : targetControl.label, isDisabled: isUsed }
		})
	})

	const targetValue = $derived(lane === undefined ? '' : getTargetId(lane.target))
	const pointCount = $derived(lane === undefined ? 0 : lane.points.length)

	const placeStyle = $derived.by(() => {
		if (open === null) return ''
		const left = open.anchor.right + GAP
		return `--inspector-left: ${left}px; --inspector-top: ${open.anchor.top}px;`
	})

	// Keeps the popover inside the window once it has a size.
	$effect(() => {
		void open
		if (root === undefined) return
		const bounds = root.getBoundingClientRect()
		const overflowBottom = bounds.bottom - (window.innerHeight - MARGIN)
		const overflowRight = bounds.right - (window.innerWidth - MARGIN)
		const shiftY = Math.max(0, overflowBottom)
		const shiftX = Math.max(0, overflowRight)
		root.style.setProperty('--inspector-shift-y', `${-shiftY}px`)
		root.style.setProperty('--inspector-shift-x', `${-shiftX}px`)
	})

	$effect(() => {
		if (isRowMissing) close()
	})

	const close = () => {
		closeRowInspector()
		focusShell()
	}

	$effect(() => {
		if (open === null) return

		// Menus built by the controls inside live outside the
		// popover's own element, so a press on a control of the
		// design system never counts as a click away.
		const handlePointerDown = (event: PointerEvent) => {
			const path = event.composedPath()
			const isInside = root !== undefined && path.includes(root)
			const isDesignSystem = path.some((node) => node instanceof Element && node.tagName.startsWith('Z-'))
			if (isInside || isDesignSystem) return
			close()
		}

		// Registered after the editor's own handler, which steps
		// aside while the popover is open.
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return
			event.preventDefault()
			close()
		}

		window.addEventListener('pointerdown', handlePointerDown, true)
		window.addEventListener('keydown', handleKeyDown)
		return () => {
			window.removeEventListener('pointerdown', handlePointerDown, true)
			window.removeEventListener('keydown', handleKeyDown)
		}
	})

	// ---- Edits ---------------------------------------------

	const handleRename = (name: string) => {
		if (layer !== undefined) return renameLayer(layer.id, name)
		if (lane !== undefined) return renameLane(lane.id, name)
		if (track !== undefined) return renameTrack(track.id, name)
		if (band !== undefined) renameBand(band.id, name)
	}

	const handleColor = (color: ColorNameT) => {
		const isChange = color !== currentColor
		if (!isChange) return
		recordHistory()
		setRowColor(rowColorId, color)
	}

	const handleTargetChange = (event: Event) => {
		if (lane === undefined) return
		const detail = (event as CustomEvent<{ value: string }>).detail
		const target = groupTargets.find((candidate) => getTargetId(candidate) === detail.value)
		if (target === undefined) return
		setLaneTarget(lane.id, target)
	}

	const handleResetLane = () => {
		if (lane === undefined) return
		resetLane(lane.id)
	}

	const handleRemove = () => {
		if (layer !== undefined) removeLayer(layer.id)
		if (lane !== undefined) removeLane(lane.id)
		if (track !== undefined) removeTrack(track.id)
		if (band !== undefined) removeBand(band.id)
		close()
	}

	const canRemove = $derived(layer !== undefined ? layer.kind !== 'logo' : lane !== undefined || track !== undefined || band !== undefined)
</script>

{#if open !== null && !isRowMissing}
	<div
		class="row-inspector"
		bind:this={root}
		role="dialog"
		aria-label="{eyebrow} settings"
		style={placeStyle}
		data-tone={currentColor}
	>
		<header class="row-inspector-header">
			<span class="row-inspector-eyebrow">{eyebrow}</span>
			{#if canRename}
				<RenameField value={currentName} label="Name" oncommit={handleRename} />
			{/if}
			{#if !canRename}
				<span class="row-inspector-title">{open.kind === 'audio' ? 'Song' : 'Scene and post'}</span>
			{/if}
			<div class="row-inspector-swatches" role="group" aria-label="Color">
				{#each PALETTE as option (option.name)}
					<button
						class="row-inspector-swatch"
						class:isActive={currentColor === option.name}
						type="button"
						data-tone={option.name}
						aria-label={option.label}
						aria-pressed={currentColor === option.name}
						title={option.label}
						onclick={() => handleColor(option.name)}
					></button>
				{/each}
			</div>
		</header>

		<div class="row-inspector-body">
			{#if layer !== undefined}
				<LayerEditor {layer} showName={false} />
			{/if}

			{#if lane !== undefined}
				<z-field label="Controls">
					<z-select size="sm" value={targetValue} options={targetOptions} placeholder="Choose control" aria-label="Automated control" onchange={handleTargetChange}></z-select>
				</z-field>
				<div class="row-inspector-actions">
					<z-button size="sm" kind="outline" tone="neutral" isDisabled={pointCount <= 1} onclick={handleResetLane}>
						<EraserIcon weight="bold" />
						Reset points
					</z-button>
				</div>
			{/if}

			{#if track !== undefined}
				<HitTrackControls {track} />
			{/if}

			{#if band !== undefined}
				<BandControls {band} />
			{/if}

			{#if canRemove && layer === undefined}
				<z-button size="sm" kind="outline" tone="danger" isFullWidth onclick={handleRemove}>
					<TrashIcon weight="bold" />
					Remove
				</z-button>
			{/if}
		</div>
	</div>
{/if}
