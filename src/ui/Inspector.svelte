<script lang="ts">
	import ExportPanel from './ExportPanel.svelte'
	import LayersPanel from './LayersPanel.svelte'
	import PostPanel from './PostPanel.svelte'
	import SettingsPanel from './SettingsPanel.svelte'
	import './Inspector.css'

	type TabNameT = 'settings' | 'layers' | 'post' | 'export'

	const TABS = [
		{ value: 'settings', label: 'Settings' },
		{ value: 'layers', label: 'Layers' },
		{ value: 'post', label: 'Post' },
		{ value: 'export', label: 'Export' }
	]

	let activeTab = $state<TabNameT>('settings')

	const handleTabChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		activeTab = detail.value as TabNameT
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
