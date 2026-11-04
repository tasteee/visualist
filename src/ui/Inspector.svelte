<script lang="ts">
	import ExportPanel from './ExportPanel.svelte'
	import SettingsPanel from './SettingsPanel.svelte'
	import './Inspector.css'

	type TabNameT = 'settings' | 'export'

	const TABS = [
		{ value: 'settings', label: 'Settings' },
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
			{#if activeTab === 'export'}
				<ExportPanel />
			{/if}
		</div>
	</z-scroll-area>
</div>
