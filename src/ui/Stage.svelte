<script lang="ts">
	import { onMount } from 'svelte'
	import { app, attachCanvas } from '../store.svelte'
	import './Stage.css'

	let canvas: HTMLCanvasElement

	const analysisPercent = $derived(Math.round(app.analysisProgress * 100))
	const recordPercent = $derived(Math.round(app.recordProgress * 100))
	const isVertical = $derived(app.settings.aspectRatio === '9:16')
	const isSquare = $derived(app.settings.aspectRatio === '1:1')
	const isPortrait = $derived(app.settings.aspectRatio === '4:5')

	onMount(() => attachCanvas(canvas))
</script>

<div class="stage-frame" class:isRecording={app.isRecording} class:isVertical class:isSquare class:isPortrait>
	<canvas class="stage-canvas" bind:this={canvas} width="1920" height="1080" aria-label="Visualizer preview"></canvas>

	{#if !app.isLayersReady}
		<div class="stage-cover">
			<z-progress isIndeterminate size="sm"></z-progress>
		</div>
	{/if}

	{#if app.isAnalyzing}
		<div class="stage-cover isCentered">
			<div class="stage-analyzing">
				<span class="stage-analyzing-title">Listening to your song</span>
				<z-progress value={analysisPercent} size="sm"></z-progress>
				<span class="stage-analyzing-hint">Finding kicks, snares and tempo · {analysisPercent}%</span>
			</div>
		</div>
	{/if}

	{#if app.isRecording}
		<div class="stage-recording">
			<z-progress value={recordPercent} size="sm" tone="danger"></z-progress>
		</div>
	{/if}
</div>
