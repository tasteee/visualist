<script lang="ts">
	import { onMount } from 'svelte'
	import { app, loadAudioFile, startApp, togglePlay } from './store.svelte'
	import DropZone from './ui/DropZone.svelte'
	import EditorDock from './ui/EditorDock.svelte'
	import Inspector from './ui/Inspector.svelte'
	import Stage from './ui/Stage.svelte'
	import { checkIsTyping } from './ui/keyboard'

	const handleKeyDown = (event: KeyboardEvent) => {
		const isSpace = event.code === 'Space'
		if (!isSpace || checkIsTyping(event)) return
		event.preventDefault()
		togglePlay()
	}

	const checkHasFiles = (event: DragEvent): boolean => {
		const types = event.dataTransfer?.types ?? []
		return Array.from(types).includes('Files')
	}

	const handleDragOver = (event: DragEvent) => {
		if (!checkHasFiles(event)) return
		event.preventDefault()
		app.isDraggingFile = true
	}

	const handleDragLeave = (event: DragEvent) => {
		const hasLeftWindow = event.relatedTarget === null
		if (hasLeftWindow) app.isDraggingFile = false
	}

	const handleDrop = (event: DragEvent) => {
		if (!checkHasFiles(event)) return
		event.preventDefault()
		app.isDraggingFile = false
		const file = event.dataTransfer?.files[0]
		if (file === undefined) return
		void loadAudioFile(file)
	}

	onMount(() => {
		void startApp()
	})
</script>

<svelte:window onkeydown={handleKeyDown} ondragover={handleDragOver} ondragleave={handleDragLeave} ondrop={handleDrop} />

<main class="app-shell">
	<section class="app-workspace">
		<div class="app-stage-area">
			<Stage />
		</div>
		{#if app.hasAudio}
			<EditorDock />
		{/if}
		{#if !app.hasAudio}
			<DropZone />
		{/if}
	</section>
	<aside class="app-inspector">
		<Inspector />
	</aside>

	{#if app.isDraggingFile}
		<div class="app-drop-overlay">
			<span class="app-drop-title">Drop to load your song</span>
			<span class="app-drop-hint">It will be analyzed in a few seconds.</span>
		</div>
	{/if}
</main>

<z-toaster position="bottom-center"></z-toaster>
