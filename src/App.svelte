<script lang="ts">
	import { onMount } from 'svelte'
	import { toaster } from '@tasteee/zest'
	import { checkIsMidiFile, openMidiFile } from './midiImport.svelte'
	import { restoreProject, startProjectWatchers } from './project.svelte'
	import { app, loadAudioFile, startApp, togglePlay } from './store.svelte'
	import DropZone from './ui/DropZone.svelte'
	import EditorDock from './ui/EditorDock.svelte'
	import Toolbar from './ui/Toolbar.svelte'
	import MidiImportDialog from './ui/MidiImportDialog.svelte'
	import Stage from './ui/Stage.svelte'
	import { toggleStageFocused, toggleUiHidden, uiState } from './uiState.svelte'
	import { installFocusGuard } from './ui/focus'
	import { checkIsTyping } from './ui/keyboard'

	let shell: HTMLElement

	// Space plays. A focused button, select or field keeps the
	// key, which is only possible after a Tab, since a click
	// hands focus back to the shell.
	const handleKeyDown = (event: KeyboardEvent) => {
		if (checkIsTyping(event)) return
		const hasModifier = event.metaKey || event.ctrlKey || event.altKey
		if (hasModifier) return
		if (event.code === 'Space') {
			event.preventDefault()
			return togglePlay()
		}
		// Tilde shows the stage over everything, backslash hides
		// every panel.
		if (event.code === 'Backquote') {
			event.preventDefault()
			return toggleStageFocused()
		}
		if (event.code === 'Backslash') {
			event.preventDefault()
			return toggleUiHidden()
		}
		const isEscape = event.key === 'Escape'
		if (isEscape && uiState.isStageFocused) uiState.isStageFocused = false
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
			toaster.show({ title: 'Load a song first', description: 'MIDI impulses are placed on the song’s timeline.', tone: 'warning' })
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
		const removeFocusGuard = installFocusGuard(shell)
		shell.focus({ preventScroll: true })
		void bootApp()
		return removeFocusGuard
	})
</script>

<svelte:window onkeydown={handleKeyDown} ondragover={handleDragOver} ondragleave={handleDragLeave} ondrop={handleDrop} />

<main class="app-shell" class:isStageFocused={uiState.isStageFocused} tabindex="-1" bind:this={shell}>
	<div class="app-canvas">
		<Stage />
	</div>

	{#if !uiState.isUiHidden}
		<div class="app-ui">
			<Toolbar />
			{#if app.hasAudio}
				<EditorDock />
			{/if}
			{#if !app.hasAudio}
				<div class="app-dropzone">
					<DropZone />
				</div>
			{/if}
		</div>
	{/if}

	{#if app.isDraggingFile}
		<div class="app-drop-overlay">
			<span class="app-drop-title">Drop a song or a MIDI file</span>
			<span class="app-drop-hint">Songs are analyzed in a few seconds. MIDI becomes impulse tracks.</span>
		</div>
	{/if}
</main>

<MidiImportDialog />

<z-toaster position="bottom-center"></z-toaster>
