<script lang="ts">
	import { toaster } from '@tasteee/zest'
	import CopyIcon from 'phosphor-svelte/lib/CopyIcon'
	import PauseIcon from 'phosphor-svelte/lib/PauseIcon'
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon'
	import TerminalWindowIcon from 'phosphor-svelte/lib/TerminalWindowIcon'
	import { buildAppStateSnapshot, selectStateSection } from '../stateSnapshot.svelte'
	import type { AppStateSnapshotT, StateSectionKeyT } from '../stateSnapshot.svelte'
	import Section from './Section.svelte'
	import './StatePanel.css'

	type SectionItemT = {
		key: StateSectionKeyT
		label: string
	}

	const SECTIONS: SectionItemT[] = [
		{ key: 'all', label: 'All' },
		{ key: 'app', label: 'App' },
		{ key: 'layers', label: 'Layers' },
		{ key: 'liveLayers', label: 'Live' },
		{ key: 'mappings', label: 'Mappings' },
		{ key: 'sources', label: 'Emitters' },
		{ key: 'automation', label: 'Lanes' },
		{ key: 'timeline', label: 'Timeline' }
	]

	let activeSection = $state<StateSectionKeyT>('all')
	let isFrozen = $state(false)
	let frozenSnapshot = $state<AppStateSnapshotT | null>(null)

	const currentSnapshot = $derived(isFrozen && frozenSnapshot !== null ? frozenSnapshot : buildAppStateSnapshot())
	const displayedValue = $derived(selectStateSection(currentSnapshot, activeSection))
	const formattedJson = $derived(JSON.stringify(displayedValue, null, 2))

	const toggleFrozen = () => {
		if (!isFrozen) {
			frozenSnapshot = buildAppStateSnapshot()
			isFrozen = true
			return
		}
		isFrozen = false
		frozenSnapshot = null
	}

	const handleCopyJson = async () => {
		try {
			await navigator.clipboard.writeText(formattedJson)
			toaster.show({ title: 'Copied app state JSON to clipboard', tone: 'success' })
		} catch {
			toaster.show({ title: 'Could not copy to clipboard', tone: 'warning' })
		}
	}

	const handleLogConsole = () => {
		console.log('[VISUALIST State Snapshot]', displayedValue)
		toaster.show({ title: 'Logged state to browser console (window.__visualist)', tone: 'info' })
	}
</script>

<Section title="State Inspector" description="Live reactive state of the app. Also accessible anytime in DevTools via window.__visualist.getState().">
	<div class="state-panel">
		<div class="state-panel-controls">
			<div class="state-panel-sections" role="tablist" aria-label="State sections">
				{#each SECTIONS as section (section.key)}
					<z-button
						size="xs"
						kind={activeSection === section.key ? 'soft' : 'ghost'}
						tone={activeSection === section.key ? 'accent' : 'neutral'}
						aria-selected={activeSection === section.key}
						onclick={() => (activeSection = section.key)}
					>
						{section.label}
					</z-button>
				{/each}
			</div>

			<div class="state-panel-actions">
				<z-button
					size="xs"
					kind={isFrozen ? 'soft' : 'outline'}
					tone={isFrozen ? 'warning' : 'neutral'}
					onclick={toggleFrozen}
				>
					{#if isFrozen}
						<PlayIcon weight="bold" />
						Resume live
					{:else}
						<PauseIcon weight="bold" />
						Freeze
					{/if}
				</z-button>

				<z-button size="xs" kind="outline" tone="neutral" onclick={handleCopyJson}>
					<CopyIcon weight="bold" />
					Copy JSON
				</z-button>

				<z-button size="xs" kind="ghost" tone="neutral" onclick={handleLogConsole}>
					<TerminalWindowIcon weight="bold" />
					Console
				</z-button>
			</div>
		</div>

		<pre class="state-panel-code">{formattedJson}</pre>
	</div>
</Section>
