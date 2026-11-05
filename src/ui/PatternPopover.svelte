<script lang="ts">
	import EraserIcon from 'phosphor-svelte/lib/EraserIcon'
	import PaintBrushIcon from 'phosphor-svelte/lib/PaintBrushIcon'
	import { PATTERN_STEPS, buildPatternHits, getStepLength, readPatternFromRange } from '../engine/hits'
	import type { TempoT, TimeRangeT } from '../engine/hits'
	import { getViewEnd } from '../engine/timeline'
	import { clearTrackRange, findTrack, paintTrackRange } from '../sources.svelte'
	import { app, getAnalysis } from '../store.svelte'
	import { timeline } from '../timeline.svelte'
	import Segmented from './Segmented.svelte'
	import './PatternPopover.css'

	// A one-bar, 16-step pattern painted across a range. Steps
	// cycle off, on, accent.
	type PatternPopoverPropsT = {
		trackId: string
		anchorX: number
		anchorY: number
		onclose: () => void
	}

	type PresetT = {
		value: string
		label: string
		steps: number[]
	}

	type RangeKindT = 'view' | 'song'

	const props: PatternPopoverPropsT = $props()

	const ON_STRENGTH = 0.8
	const ACCENT_STRENGTH = 1
	const BEATS_PER_BAR = 4
	const STEP_INDEXES = Array.from({ length: PATTERN_STEPS }, (_, index) => index)

	const buildSteps = (onSteps: number[]): number[] => {
		return STEP_INDEXES.map((index) => (onSteps.includes(index) ? ON_STRENGTH : 0))
	}

	const PRESETS: PresetT[] = [
		{ value: 'four', label: 'Four on the floor', steps: buildSteps([0, 4, 8, 12]) },
		{ value: 'backbeat', label: 'Backbeat', steps: buildSteps([4, 12]) },
		{ value: 'offbeat', label: 'Offbeats', steps: buildSteps([2, 6, 10, 14]) },
		{ value: 'eighths', label: 'Eighths', steps: buildSteps([0, 2, 4, 6, 8, 10, 12, 14]) },
		{ value: 'sixteenths', label: 'Sixteenths', steps: buildSteps(STEP_INDEXES) }
	]

	const RANGE_OPTIONS = [
		{ value: 'view', label: 'Visible range' },
		{ value: 'song', label: 'Whole song' }
	]

	let root = $state<HTMLDivElement | undefined>(undefined)
	let rangeKind = $state<RangeKindT>('view')

	const track = $derived(findTrack(props.trackId))
	const isReady = $derived(track !== undefined)
	const trackName = $derived(track === undefined ? 'Track' : track.name)

	const getTempo = (): TempoT => {
		const analysis = getAnalysis()
		return { bpm: analysis.bpm, beatOffset: analysis.beatOffset }
	}

	// The bar under the playhead, to read the starting pattern.
	// Before bar 1, that is bar 1.
	const getPlayheadBar = (tempo: TempoT): TimeRangeT => {
		const barLength = getStepLength(tempo) * PATTERN_STEPS
		const playheadBar = Math.floor((app.currentTime - tempo.beatOffset) / barLength)
		const barIndex = Math.max(0, playheadBar)
		const start = tempo.beatOffset + barIndex * barLength
		return { start, end: start + barLength }
	}

	const readStartingPattern = (): number[] => {
		const startingTrack = findTrack(props.trackId)
		if (startingTrack === undefined) return buildSteps([])
		const tempo = getTempo()
		return readPatternFromRange(startingTrack.hits, getPlayheadBar(tempo), tempo)
	}

	let pattern = $state<number[]>(readStartingPattern())

	const getRange = (): TimeRangeT => {
		const isSong = rangeKind === 'song'
		if (isSong) return { start: 0, end: app.duration }
		const start = Math.max(0, timeline.view.start)
		const end = Math.min(app.duration, getViewEnd(timeline.view))
		return { start, end }
	}

	const getNextStrength = (strength: number): number => {
		const isOff = strength <= 0
		if (isOff) return ON_STRENGTH
		const isOn = strength < ACCENT_STRENGTH
		if (isOn) return ACCENT_STRENGTH
		return 0
	}

	const handleStepClick = (index: number) => {
		const nextPattern = [...pattern]
		nextPattern[index] = getNextStrength(pattern[index])
		pattern = nextPattern
	}

	const handlePreset = (preset: PresetT) => {
		pattern = [...preset.steps]
	}

	const handleClearSteps = () => {
		pattern = buildSteps([])
	}

	const handlePaint = () => {
		const tempo = getTempo()
		const range = getRange()
		const hits = buildPatternHits(pattern, range, tempo)
		paintTrackRange(props.trackId, range, hits)
		props.onclose()
	}

	const handleClearRange = () => {
		clearTrackRange(props.trackId, getRange())
		props.onclose()
	}

	const handleRangeChange = (value: string) => {
		rangeKind = value as RangeKindT
	}

	const checkIsBeatStart = (index: number): boolean => index % BEATS_PER_BAR === 0
	const checkIsOn = (index: number): boolean => pattern[index] > 0
	const checkIsAccent = (index: number): boolean => pattern[index] >= ACCENT_STRENGTH

	const getStepState = (index: number): string => {
		if (checkIsAccent(index)) return 'accent'
		if (checkIsOn(index)) return 'on'
		return 'off'
	}

	const describeStep = (index: number): string => {
		const beat = Math.floor(index / BEATS_PER_BAR) + 1
		const sixteenth = (index % BEATS_PER_BAR) + 1
		return `Beat ${beat}, step ${sixteenth}: ${getStepState(index)}`
	}

	$effect(() => {
		if (!isReady) props.onclose()
	})

	$effect(() => {
		const handlePointerDown = (event: PointerEvent) => {
			const isInside = root !== undefined && event.composedPath().includes(root)
			if (!isInside) props.onclose()
		}
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') props.onclose()
		}
		window.addEventListener('pointerdown', handlePointerDown, true)
		window.addEventListener('keydown', handleKeyDown)
		return () => {
			window.removeEventListener('pointerdown', handlePointerDown, true)
			window.removeEventListener('keydown', handleKeyDown)
		}
	})
</script>

{#if isReady}
	<div
		class="pattern-popover"
		bind:this={root}
		role="dialog"
		aria-label="Paint a pattern on {trackName}"
		style:--popover-x="{props.anchorX}px"
		style:--popover-y="{props.anchorY}px"
	>
		<div class="pattern-popover-header">
			<span class="pattern-popover-eyebrow">Pattern</span>
			<span class="pattern-popover-title">{trackName}</span>
		</div>

		<div class="pattern-popover-presets">
			{#each PRESETS as preset (preset.value)}
				<button class="pattern-popover-preset" type="button" onclick={() => handlePreset(preset)}>{preset.label}</button>
			{/each}
			<button class="pattern-popover-preset" type="button" onclick={handleClearSteps}>None</button>
		</div>

		<div class="pattern-popover-steps" role="group" aria-label="Steps, one bar">
			{#each STEP_INDEXES as index (index)}
				<button
					class="pattern-popover-step"
					class:isBeatStart={checkIsBeatStart(index)}
					class:isOn={checkIsOn(index)}
					class:isAccent={checkIsAccent(index)}
					type="button"
					aria-label={describeStep(index)}
					aria-pressed={checkIsOn(index)}
					onclick={() => handleStepClick(index)}
				></button>
			{/each}
		</div>
		<span class="pattern-popover-hint">Click a step for on, again for accent, again for off.</span>

		<Segmented label="Paint over" options={RANGE_OPTIONS} value={rangeKind} onchange={handleRangeChange} />

		<div class="pattern-popover-actions">
			<z-button size="sm" kind="outline" tone="danger" onclick={handleClearRange}>
				<EraserIcon weight="bold" />
				Clear
			</z-button>
			<z-button size="sm" kind="solid" tone="primary" onclick={handlePaint}>
				<PaintBrushIcon weight="bold" />
				Paint
			</z-button>
		</div>
	</div>
{/if}
