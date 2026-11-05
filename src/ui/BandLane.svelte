<script lang="ts">
	import SlidersHorizontalIcon from 'phosphor-svelte/lib/SlidersHorizontalIcon'
	import { getRowColor, getRowHeightStyle } from '../appearance.svelte'
	import { PATH_WIDTH } from '../engine/automation'
	import { formatBandRange } from '../engine/bands'
	import { getBandSignal, getBandSourceId } from '../engine/sources'
	import { checkIsTimeVisible, getViewEnd, timeToPercent, timeToRatio } from '../engine/timeline'
	import type { GridLineT, TimelineGridT } from '../engine/timeline'
	import type { BandSourceT, CompiledBandT, HitT } from '../engine/types'
	import { app, getLiveSignals } from '../store.svelte'
	import { timeline } from '../timeline.svelte'
	import ColorDot from './ColorDot.svelte'
	import RowResizer from './RowResizer.svelte'
	import './BandLane.css'

	// A read-only view of what a frequency band responds to, so
	// its range can be tuned against the song. Edited in the
	// Audio panel.
	type BandLanePropsT = {
		band: BandSourceT
		compiled: CompiledBandT | undefined
		grid: TimelineGridT
		onedit: () => void
	}

	const props: BandLanePropsT = $props()

	const CURVE_SAMPLES = 360
	const PATH_HEIGHT = 100

	const view = $derived(timeline.view)
	const bandColor = $derived(getRowColor(props.band.id, 'amber'))
	const customHeight = $derived(getRowHeightStyle(props.band.id))
	const rangeLabel = $derived(formatBandRange(props.band))
	const isHits = $derived(props.band.output === 'hits')
	const outputLabel = $derived(isHits ? 'Hits' : 'Level')
	const metaLabel = $derived(`${rangeLabel} · ${outputLabel}`)
	const sourceId = $derived(getBandSourceId(props.band.id))
	const liveLevel = $derived(getLiveSignals()[sourceId] ?? 0)
	const liveStyle = $derived(`${(liveLevel * 100).toFixed(1)}%`)
	const barLines = $derived(props.grid.lines.filter((line) => line.kind === 'label' || line.kind === 'bar'))
	const playheadPercent = $derived(timeToPercent(app.currentTime, view))
	const isPlayheadVisible = $derived(checkIsTimeVisible(app.currentTime, view))
	const hasCurve = $derived(props.compiled !== undefined && props.compiled.series.length > 0)

	const getGridX = (line: GridLineT): number => timeToRatio(line.time, view) * PATH_WIDTH

	const buildCurvePath = (compiled: CompiledBandT | undefined): string => {
		if (compiled === undefined) return ''
		const sampleIndexes = Array.from({ length: CURVE_SAMPLES + 1 }, (_, index) => index)
		const commands = sampleIndexes.map((index) => {
			const ratio = index / CURVE_SAMPLES
			const time = view.start + ratio * view.span
			const level = getBandSignal(compiled, time)
			const x = (ratio * PATH_WIDTH).toFixed(1)
			const y = ((1 - level) * PATH_HEIGHT).toFixed(1)
			const command = index === 0 ? 'M' : 'L'
			return `${command}${x} ${y}`
		})
		return commands.join(' ')
	}

	const buildAreaPath = (linePath: string): string => {
		const hasLine = linePath !== ''
		if (!hasLine) return ''
		return `${linePath} L${PATH_WIDTH} ${PATH_HEIGHT} L0 ${PATH_HEIGHT} Z`
	}

	const curvePath = $derived(buildCurvePath(props.compiled))
	const areaPath = $derived(buildAreaPath(curvePath))

	const visibleHits = $derived.by((): HitT[] => {
		const compiled = props.compiled
		if (compiled === undefined || !isHits) return []
		const end = getViewEnd(view)
		return compiled.hits.filter((hit) => hit.time >= view.start && hit.time <= end)
	})

	const getHitX = (hit: HitT): number => timeToPercent(hit.time, view)
</script>

<div class="band-lane" data-tone={bandColor} style:--band-lane-custom-height={customHeight}>
	<div class="band-lane-header">
		<div class="band-lane-title">
			<ColorDot rowId={props.band.id} color={bandColor} label={props.band.name} />
			<span class="band-lane-name">{props.band.name}</span>
			<z-tooltip content="Edit in the Audio panel" placement="top" openDelay={300}>
				<button class="band-lane-action" type="button" aria-label="Edit {props.band.name} in the Audio panel" onclick={props.onedit}>
					<SlidersHorizontalIcon weight="bold" />
				</button>
			</z-tooltip>
		</div>
		<div class="band-lane-meta">
			<span class="band-lane-meter" aria-hidden="true">
				<span class="band-lane-meter-fill" style:--band-lane-level={liveStyle}></span>
			</span>
			<span class="band-lane-range">{metaLabel}</span>
		</div>
	</div>

	<div class="band-lane-track" data-track="lane" role="img" aria-label="{props.band.name} response">
		<svg class="band-lane-graph" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
			{#each barLines as line (line.time)}
				<line class="band-lane-gridline" class:isLabel={line.kind === 'label'} x1={getGridX(line)} x2={getGridX(line)} y1="0" y2="100" />
			{/each}
			<path class="band-lane-area" d={areaPath} />
			<path class="band-lane-line" d={curvePath} />
		</svg>

		{#each visibleHits as hit (hit.time)}
			<span class="band-lane-hit" style:--band-x="{getHitX(hit)}%"></span>
		{/each}

		{#if isPlayheadVisible}
			<div class="band-lane-playhead" style:--band-x="{playheadPercent}%"></div>
		{/if}

		{#if !hasCurve}
			<span class="band-lane-empty">Load a song to see this band</span>
		{/if}
	</div>

	<RowResizer rowId={props.band.id} label={props.band.name} />
</div>
