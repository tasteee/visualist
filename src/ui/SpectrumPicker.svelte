<script lang="ts">
	import { clampBandRange, formatHz, hzToRatio, ratioToHz } from '../engine/bands'
	import type { BandRangeT } from '../engine/bands'
	import { clamp } from '../engine/settings'
	import { checkHasSpectrum } from '../engine/spectrum'
	import type { SpectrumT } from '../engine/types'
	import './SpectrumPicker.css'

	// The song's average spectrum on a log frequency axis, with
	// the band's range on top. Drag an edge to resize the band,
	// or drag its middle to slide it.
	type SpectrumPickerPropsT = {
		spectrum: SpectrumT
		lowHz: number
		highHz: number
		label: string
		onchange: (range: BandRangeT) => void
	}

	type DragKindT = 'low' | 'high' | 'body'

	type DragT = {
		kind: DragKindT
		startRatio: number
		startLow: number
		startHigh: number
	}

	type SpectrumBarT = {
		key: number
		x: number
		width: number
		height: number
	}

	type AxisMarkT = {
		hz: number
		label: string
		percent: number
	}

	const props: SpectrumPickerPropsT = $props()

	const DB_RANGE = 54
	const PATH_WIDTH = 1000
	const PATH_HEIGHT = 100
	const KEY_STEP_OCTAVES = 1 / 12
	const FINE_DIVIDER = 4
	const AXIS_HZ = [50, 100, 200, 500, 1000, 2000, 5000, 10000]

	let surface = $state<HTMLDivElement | undefined>(undefined)
	let drag = $state<DragT | null>(null)

	const hasSpectrum = $derived(checkHasSpectrum(props.spectrum))
	const lowPercent = $derived(hzToRatio(props.lowHz) * 100)
	const highPercent = $derived(hzToRatio(props.highHz) * 100)
	const widthPercent = $derived(highPercent - lowPercent)
	const lowLabel = $derived(formatHz(props.lowHz))
	const highLabel = $derived(formatHz(props.highHz))
	const isDragging = $derived(drag !== null)

	const getPeakDb = (averageDb: Float32Array): number => {
		let peak = -Infinity
		for (const value of averageDb) peak = Math.max(peak, value)
		return peak
	}

	const buildBars = (spectrum: SpectrumT): SpectrumBarT[] => {
		const peakDb = getPeakDb(spectrum.averageDb)
		const floorDb = peakDb - DB_RANGE
		const bandIndexes = Array.from({ length: spectrum.bandCount }, (_, index) => index)
		return bandIndexes.map((band) => {
			const startRatio = hzToRatio(spectrum.edges[band])
			const endRatio = hzToRatio(spectrum.edges[band + 1])
			const level = clamp((spectrum.averageDb[band] - floorDb) / DB_RANGE, 0, 1)
			return {
				key: band,
				x: startRatio * PATH_WIDTH,
				width: Math.max(0, (endRatio - startRatio) * PATH_WIDTH - 1),
				height: level * PATH_HEIGHT
			}
		})
	}

	const bars = $derived(hasSpectrum ? buildBars(props.spectrum) : [])

	const buildAxisMarks = (): AxisMarkT[] => {
		return AXIS_HZ.map((hz) => {
			const isKilohertz = hz >= 1000
			const label = isKilohertz ? `${hz / 1000}k` : String(hz)
			return { hz, label, percent: hzToRatio(hz) * 100 }
		})
	}

	const axisMarks = buildAxisMarks()

	const checkIsBarInRange = (bar: SpectrumBarT): boolean => {
		const barMiddle = ((bar.x + bar.width / 2) / PATH_WIDTH) * 100
		return barMiddle >= lowPercent && barMiddle <= highPercent
	}

	const readRatio = (event: PointerEvent): number => {
		if (surface === undefined) return 0
		const bounds = surface.getBoundingClientRect()
		return clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
	}

	const startDrag = (event: PointerEvent, kind: DragKindT) => {
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		event.stopPropagation()
		const element = event.currentTarget as HTMLElement
		element.setPointerCapture(event.pointerId)
		drag = { kind, startRatio: readRatio(event), startLow: props.lowHz, startHigh: props.highHz }
	}

	// Sliding keeps the band's width in octaves.
	const buildBodyRange = (activeDrag: DragT, ratio: number): BandRangeT => {
		const travel = ratio - activeDrag.startRatio
		const lowRatio = hzToRatio(activeDrag.startLow) + travel
		const highRatio = hzToRatio(activeDrag.startHigh) + travel
		const overflowHigh = Math.max(0, highRatio - 1)
		const overflowLow = Math.max(0, -lowRatio)
		const shift = overflowLow - overflowHigh
		return { lowHz: ratioToHz(lowRatio + shift), highHz: ratioToHz(highRatio + shift) }
	}

	const buildDragRange = (activeDrag: DragT, ratio: number): BandRangeT => {
		const isLow = activeDrag.kind === 'low'
		if (isLow) return { lowHz: ratioToHz(ratio), highHz: props.highHz }
		const isHigh = activeDrag.kind === 'high'
		if (isHigh) return { lowHz: props.lowHz, highHz: ratioToHz(ratio) }
		return buildBodyRange(activeDrag, ratio)
	}

	const handleMove = (event: PointerEvent) => {
		const activeDrag = drag
		if (activeDrag === null) return
		const range = buildDragRange(activeDrag, readRatio(event))
		props.onchange(clampBandRange(range))
	}

	const handleUp = () => {
		drag = null
	}

	const handleEdgeKey = (event: KeyboardEvent, kind: 'low' | 'high') => {
		const directions: Partial<Record<string, number>> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }
		const direction = directions[event.key] ?? 0
		const isArrow = direction !== 0
		if (!isArrow) return
		event.preventDefault()
		const divider = event.shiftKey ? FINE_DIVIDER : 1
		const factor = Math.pow(2, (direction * KEY_STEP_OCTAVES) / divider)
		const isLow = kind === 'low'
		const nextLow = isLow ? props.lowHz * factor : props.lowHz
		const nextHigh = isLow ? props.highHz : props.highHz * factor
		props.onchange(clampBandRange({ lowHz: nextLow, highHz: nextHigh }))
	}
</script>

<div class="spectrum-picker" class:isDragging>
	<div class="spectrum-picker-surface" bind:this={surface}>
		<svg class="spectrum-picker-bars" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
			{#each bars as bar (bar.key)}
				<rect class="spectrum-picker-bar" class:isInRange={checkIsBarInRange(bar)} x={bar.x} y={PATH_HEIGHT - bar.height} width={bar.width} height={bar.height} />
			{/each}
		</svg>

		{#each axisMarks as mark (mark.hz)}
			<span class="spectrum-picker-gridline" style:--spectrum-x="{mark.percent}%"></span>
		{/each}

		<div
			class="spectrum-picker-range"
			style:--spectrum-x="{lowPercent}%"
			style:--spectrum-width="{widthPercent}%"
			role="presentation"
			onpointerdown={(event) => startDrag(event, 'body')}
			onpointermove={handleMove}
			onpointerup={handleUp}
			onpointercancel={handleUp}
		></div>

		<div
			class="spectrum-picker-edge isLow"
			style:--spectrum-x="{lowPercent}%"
			role="slider"
			tabindex="0"
			aria-label="{props.label} low edge"
			aria-valuemin={20}
			aria-valuemax={16000}
			aria-valuenow={Math.round(props.lowHz)}
			aria-valuetext={lowLabel}
			onpointerdown={(event) => startDrag(event, 'low')}
			onpointermove={handleMove}
			onpointerup={handleUp}
			onpointercancel={handleUp}
			onkeydown={(event) => handleEdgeKey(event, 'low')}
		></div>
		<div
			class="spectrum-picker-edge isHigh"
			style:--spectrum-x="{highPercent}%"
			role="slider"
			tabindex="0"
			aria-label="{props.label} high edge"
			aria-valuemin={20}
			aria-valuemax={16000}
			aria-valuenow={Math.round(props.highHz)}
			aria-valuetext={highLabel}
			onpointerdown={(event) => startDrag(event, 'high')}
			onpointermove={handleMove}
			onpointerup={handleUp}
			onpointercancel={handleUp}
			onkeydown={(event) => handleEdgeKey(event, 'high')}
		></div>

		{#if !hasSpectrum}
			<span class="spectrum-picker-empty">Load a song to see its spectrum</span>
		{/if}
	</div>

	<div class="spectrum-picker-axis" aria-hidden="true">
		{#each axisMarks as mark (mark.hz)}
			<span class="spectrum-picker-tick" style:--spectrum-x="{mark.percent}%">{mark.label}</span>
		{/each}
	</div>
</div>
