<script lang="ts">
	import { onMount } from 'svelte'
	import { app, loadAudioFile, startApp, togglePlay } from './store.svelte'
	import Header from './ui/Header.svelte'
	import Inspector from './ui/Inspector.svelte'
	import Stage from './ui/Stage.svelte'
	import Transport from './ui/Transport.svelte'

	const TYPING_TAGS = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']

	const checkIsTyping = (event: KeyboardEvent): boolean => {
		const origin = event.composedPath()[0]
		const isElement = origin instanceof HTMLElement
		if (!isElement) return false
		const isTypingTag = TYPING_TAGS.includes(origin.tagName)
		return isTypingTag || origin.isContentEditable
	}

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
	<Header />
	<section class="app-workspace">
		<Stage />
		<Transport />
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
