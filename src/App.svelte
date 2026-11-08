<script lang="ts">
	import { onMount } from 'svelte'
	import { toaster } from '@tasteee/zest'
	import { openMidiFile } from './midiImport.svelte'
	import { restoreProject, startProjectWatchers } from './project.svelte'
	import { installGlobalStateInspector } from './stateSnapshot.svelte'
	import { addAudioFile, app, startApp, togglePlay } from './store.svelte'
	import { addAssetLayer, addVideoLayer } from './layers.svelte'
	import { readDroppedKind } from './droppedFiles'
	import BpmDialog from './ui/BpmDialog.svelte'
	import DockToolbar from './ui/DockToolbar.svelte'
	import { installHelpText } from './help.svelte'
	import InspectorPanel from './ui/InspectorPanel.svelte'
	import DropZone from './ui/DropZone.svelte'
	import EditorDock from './ui/EditorDock.svelte'
	import Toolbar from './ui/Toolbar.svelte'
	import MidiImportDialog from './ui/MidiImportDialog.svelte'
	import Stage from './ui/Stage.svelte'
	import { getSelectedClip, getSelectedLayer, layerStore } from './layers.svelte'
	import { timeline } from './timeline.svelte'
	import { toggleStageFocused, toggleUiHidden, uiState } from './uiState.svelte'
	import { installFocusGuard } from './ui/focus'
	import { checkIsTextEntry, checkIsTyping } from './ui/keyboard'

	let shell: HTMLElement

	// The inspector docks on the left while a clip or layer is selected.
	const hasInspector = $derived(!uiState.isUiHidden && (getSelectedClip() !== undefined || getSelectedLayer() !== undefined))

	// Space plays. A focused button, select or field keeps the
	// key, which is only possible after a Tab, since a click
	// hands focus back to the shell.
	const handleKeyDown = (event: KeyboardEvent) => {
		if (checkIsTextEntry(event)) return
		const hasModifierKey = event.metaKey || event.ctrlKey || event.altKey
		if (!hasModifierKey && event.code === 'Space') {
			event.preventDefault()
			return togglePlay()
		}
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
		const files = Array.from(event.dataTransfer?.files ?? [])
		for (const file of files) handleDroppedFile(file)
	}

	// Each dropped file becomes what it is: MIDI impulses, an audio
	// layer, a video layer or a picture layer.
	const handleDroppedFile = (file: File) => {
		const kind = readDroppedKind(file)
		if (kind === 'midi') return handleMidiDrop(file)
		if (kind === 'audio') return void addAudioFile(file)
		if (kind === 'video') return void addVideoLayer(file, app.currentTime)
		if (kind === 'image') return void addAssetLayer(file)
		toaster.show({ title: 'Unsupported file', description: `${file.name} is not audio, video, a picture or MIDI.`, tone: 'warning' })
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
		installGlobalStateInspector()
		const removeFocusGuard = installFocusGuard(shell)
		const removeHelpText = installHelpText()
		shell.focus({ preventScroll: true })
		void bootApp()
		return () => {
			removeFocusGuard()
			removeHelpText()
		}
	})
</script>

<svelte:window onkeydown={handleKeyDown} ondragover={handleDragOver} ondragleave={handleDragLeave} ondrop={handleDrop} />

<main class="app-shell" class:isStageFocused={uiState.isStageFocused} style:--editor-dock-height="{timeline.dockHeight}px" tabindex="-1" bind:this={shell}>
	<!-- A strict vertical split: the workspace on top, the editor below.
	     The editor never covers the workspace. Dragging the divider
	     between them gives one pane the height the other loses, and the
	     stage fits itself into whatever the top pane has left. -->
	{#if !uiState.isUiHidden}
		<Toolbar />
	{/if}

	<div class="app-top" class:hasInspector>
		{#if !uiState.isUiHidden}
			<InspectorPanel />
		{/if}
		<div class="app-canvas">
			<Stage />
		</div>

		{#if !uiState.isUiHidden}
			{#if !app.hasSong && layerStore.layers.length === 0}
				<div class="app-dropzone">
					<DropZone />
				</div>
			{/if}
		{/if}
	</div>

	{#if !uiState.isUiHidden && app.hasAudio}
		<div class="app-bottom" class:isFolded={uiState.isDockFolded}>
			<DockToolbar />
			<EditorDock />
		</div>
	{/if}

	{#if app.isDraggingFile}
		<div class="app-drop-overlay">
			<span class="app-drop-title">Drop audio, video, pictures or MIDI</span>
			<span class="app-drop-hint">Each file becomes a layer on the timeline. MIDI becomes impulse tracks.</span>
		</div>
	{/if}
</main>

<MidiImportDialog />
<BpmDialog />

<z-toaster position="bottom-center"></z-toaster>
