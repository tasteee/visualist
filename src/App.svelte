<script lang="ts">
	import { onMount } from 'svelte'
	import { toaster } from '@tasteee/zest'
	import { checkIsMidiFile, openMidiFile } from './midiImport.svelte'
	import { restoreProject, startProjectWatchers } from './project.svelte'
	import { app, loadAudioFile, startApp, togglePlay } from './store.svelte'
	import DropZone from './ui/DropZone.svelte'
	import EditorDock from './ui/EditorDock.svelte'
	import Inspector from './ui/Inspector.svelte'
	import MidiImportDialog from './ui/MidiImportDialog.svelte'
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
		const isMidi = checkIsMidiFile(file)
		if (isMidi) return handleMidiDrop(file)
		void loadAudioFile(file)
	}

	// MIDI lands on the song's timeline, so it needs a song.
	const handleMidiDrop = (file: File) => {
		if (!app.hasAudio) {
			toaster.show({ title: 'Load a song first', description: 'MIDI hits are placed on the song’s timeline.', tone: 'warning' })
			return
		}
		void openMidiFile(file)
	}

	// The app starts on the demo, then brings back the last
	// project if one was saved.
	const bootApp = async () => {
		await startApp()
		startProjectWatchers()
		await restoreProject()
	}

	onMount(() => {
		void bootApp()
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
			<span class="app-drop-title">Drop a song or a MIDI file</span>
			<span class="app-drop-hint">Songs are analyzed in a few seconds. MIDI becomes hit tracks.</span>
		</div>
	{/if}
</main>

<MidiImportDialog />

<z-toaster position="bottom-center"></z-toaster>
