<script lang="ts">
	import EffectsPanel from './EffectsPanel.svelte'
	import ExportPanel from './ExportPanel.svelte'
	import LookPanel from './LookPanel.svelte'
	import MusicPanel from './MusicPanel.svelte'
	import './Inspector.css'

	type TabNameT = 'look' | 'music' | 'effects' | 'export'

	const TABS = [
		{ value: 'look', label: 'Look' },
		{ value: 'music', label: 'Music' },
		{ value: 'effects', label: 'Effects' },
		{ value: 'export', label: 'Export' }
	]

	let activeTab = $state<TabNameT>('look')

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
			{#if activeTab === 'look'}
				<LookPanel />
			{/if}
			{#if activeTab === 'music'}
				<MusicPanel />
			{/if}
			{#if activeTab === 'effects'}
				<EffectsPanel />
			{/if}
			{#if activeTab === 'export'}
				<ExportPanel />
			{/if}
		</div>
	</z-scroll-area>
</div>
