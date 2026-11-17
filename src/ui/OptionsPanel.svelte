<script lang="ts">
	import { toaster } from '@tasteee/zest'
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon'
	import DownloadSimpleIcon from 'phosphor-svelte/lib/DownloadSimpleIcon'
	import FloppyDiskIcon from 'phosphor-svelte/lib/FloppyDiskIcon'
	import UploadSimpleIcon from 'phosphor-svelte/lib/UploadSimpleIcon'
	import { exportProjectFile, importProjectFile } from '../projectFile'
	import { saveProjectNow } from '../project.svelte'
	import { resetProject } from '../resetProject'
	import Section from './Section.svelte'
	import './OptionsPanel.css'

	// Project-wide actions. Reset asks twice, since it can not be undone.
	let isConfirming = $state(false)
	let importInput: HTMLInputElement
	let selectedFile = $state<File | null>(null)
	let isWorking = $state(false)

	const confirmLabel = $derived(isConfirming ? 'Click again to erase everything' : 'Reset project')

	const handleReset = () => {
		if (!isConfirming) {
			isConfirming = true
			return
		}
		void resetProject()
	}

	const handleCancel = () => {
		isConfirming = false
	}

	const handleSave = () => {
		const wasSaved = saveProjectNow()
		const title = wasSaved ? 'Project saved' : 'Could not save project'
		const tone = wasSaved ? 'success' : 'danger'
		toaster.show({ title, tone })
	}

	const handleExport = async () => {
		if (isWorking) return
		isWorking = true
		try {
			await exportProjectFile()
			toaster.show({ title: 'Project exported', tone: 'success' })
		} catch (error) {
			const description = error instanceof Error ? error.message : 'Could not export the project'
			toaster.show({ title: 'Export failed', description, tone: 'danger' })
		} finally {
			isWorking = false
		}
	}

	const handleChooseImport = () => {
		importInput.click()
	}

	const handleImportFileChange = (event: Event) => {
		const input = event.currentTarget as HTMLInputElement
		selectedFile = input.files?.[0] ?? null
		input.value = ''
	}

	const handleImport = async () => {
		const file = selectedFile
		if (file === null || isWorking) return
		isWorking = true
		try {
			await importProjectFile(file)
		} catch (error) {
			const description = error instanceof Error ? error.message : 'Could not import the project'
			toaster.show({ title: 'Import failed', description, tone: 'danger' })
			isWorking = false
		}
	}

	const handleCancelImport = () => {
		selectedFile = null
	}
</script>

<Section title="Save and transfer">
	<div class="projectFileActions">
		<z-button size="md" kind="outline" tone="neutral" isFullWidth onclick={handleSave}>
			<FloppyDiskIcon weight="bold" /> Save project
		</z-button>
		<z-button size="md" kind="outline" tone="neutral" isFullWidth isDisabled={isWorking} onclick={handleExport}>
			<DownloadSimpleIcon weight="bold" /> Export project file
		</z-button>
		<z-button size="md" kind="outline" tone="neutral" isFullWidth isDisabled={isWorking} onclick={handleChooseImport}>
			<UploadSimpleIcon weight="bold" /> Import project file
		</z-button>
	</div>
	<input
		class="projectFileInput"
		type="file"
		accept=".json,.visualist.json,application/json"
		aria-label="Choose project file"
		bind:this={importInput}
		onchange={handleImportFileChange}
	/>
	{#if selectedFile !== null}
		<div class="projectFileConfirm">
			<p>Replace this project with <strong>{selectedFile.name}</strong>?</p>
			<z-button size="md" kind="solid" tone="primary" isFullWidth isDisabled={isWorking} onclick={handleImport}
				>Import and replace</z-button
			>
			<z-button size="md" kind="ghost" tone="neutral" isFullWidth onclick={handleCancelImport}>Cancel</z-button>
		</div>
	{/if}
</Section>

<Section title="Project">
	<z-button size="md" kind={isConfirming ? 'solid' : 'outline'} tone="danger" isFullWidth onclick={handleReset}>
		<ArrowCounterClockwiseIcon weight="bold" />
		{confirmLabel}
	</z-button>
	{#if isConfirming}
		<z-button size="md" kind="ghost" tone="neutral" isFullWidth onclick={handleCancel}>Keep my project</z-button>
	{/if}
</Section>
