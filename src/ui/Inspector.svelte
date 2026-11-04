<script lang="ts">
	import { inspector, showInspectorTab } from '../inspector.svelte'
	import type { InspectorTabT } from '../inspector.svelte'
	import ExportPanel from './ExportPanel.svelte'
	import LayersPanel from './LayersPanel.svelte'
	import PostPanel from './PostPanel.svelte'
	import SettingsPanel from './SettingsPanel.svelte'
	import './Inspector.css'


	const TABS = [
		{ value: 'settings', label: 'Settings' },
		{ value: 'layers', label: 'Layers' },
		{ value: 'post', label: 'Post' },
		{ value: 'export', label: 'Export' }
	]

	const activeTab = $derived(inspector.activeTab)

	const handleTabChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		showInspectorTab(detail.value as InspectorTabT)
	}
</script>

<div class="inspector">
	<div class="inspector-tabs">
		<z-tabs tabs={TABS} value={activeTab} isFitted onchange={handleTabChange}></z-tabs>
	</div>

	<z-scroll-area class="inspector-scroll" height="100%">
		<div class="inspector-panel">
			{#if activeTab === 'settings'}
				<SettingsPanel />
			{/if}
			{#if activeTab === 'layers'}
				<LayersPanel />
			{/if}
			{#if activeTab === 'post'}
				<PostPanel />
			{/if}
			{#if activeTab === 'export'}
				<ExportPanel />
			{/if}
		</div>
	</z-scroll-area>
</div>
