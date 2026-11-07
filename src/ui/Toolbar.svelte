<script lang="ts">
	import { onMount } from 'svelte'
	import ExportIcon from 'phosphor-svelte/lib/ExportIcon'
	import FadersIcon from 'phosphor-svelte/lib/FadersIcon'
	import MagicWandIcon from 'phosphor-svelte/lib/MagicWandIcon'
	import PaletteIcon from 'phosphor-svelte/lib/PaletteIcon'
	import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon'
	import { closeInspectorTab, inspector, toggleInspectorTab } from '../inspector.svelte'
	import type { InspectorTabT } from '../inspector.svelte'
	import ExportPanel from './ExportPanel.svelte'
	import PalettePanel from './PalettePanel.svelte'
	import PostPanel from './PostPanel.svelte'
	import SettingsPanel from './SettingsPanel.svelte'
	import OptionsPanel from './OptionsPanel.svelte'
	import { focusShell } from './focus'
	import { press } from './press'
	import './Toolbar.css'

	// Menus for the project as a whole, floating in the top right.
	// Row and layer controls live in each row's own popover.
	type ToolbarItemT = {
		tab: InspectorTabT
		label: string
	}

	const ITEMS: ToolbarItemT[] = [
		{ tab: 'settings', label: 'Settings' },
		{ tab: 'palette', label: 'Palette' },
		{ tab: 'post', label: 'Post' },
		{ tab: 'export', label: 'Export' },
		{ tab: 'options', label: 'Options' }
	]

	let root: HTMLDivElement

	const activeTab = $derived(inspector.activeTab)

	const close = () => {
		closeInspectorTab()
		focusShell()
	}

	// A press anywhere outside the toolbar and its menu closes it.
	// Controls of the design system draw menus of their own, and
	// those never count as a click away.
	onMount(() => {
		const handlePointerDown = (event: PointerEvent) => {
			const isOpen = inspector.activeTab !== null
			if (!isOpen) return
			const path = event.composedPath()
			const isInside = path.includes(root)
			const isDesignSystem = path.some((node) => node instanceof Element && node.tagName.startsWith('Z-'))
			if (isInside || isDesignSystem) return
			close()
		}
		const handleKeyDown = (event: KeyboardEvent) => {
			const isOpen = inspector.activeTab !== null
			if (event.key !== 'Escape' || !isOpen) return
			event.preventDefault()
			close()
		}
		window.addEventListener('pointerdown', handlePointerDown, true)
		window.addEventListener('keydown', handleKeyDown)
		return () => {
			window.removeEventListener('pointerdown', handlePointerDown, true)
			window.removeEventListener('keydown', handleKeyDown)
		}
	})
</script>

<div class="toolbar" bind:this={root}>
	<div class="toolbar-bar" role="toolbar" aria-label="Project menus">
		{#each ITEMS as item (item.tab)}
			<z-button size="sm" kind={activeTab === item.tab ? 'soft' : 'ghost'} tone="neutral" aria-pressed={activeTab === item.tab} {...press(() => toggleInspectorTab(item.tab))}>
				{#if item.tab === 'settings'}
					<FadersIcon weight="bold" />
				{/if}
				{#if item.tab === 'options'}
					<GearSixIcon weight="bold" />
				{/if}
				{#if item.tab === 'post'}
					<MagicWandIcon weight="bold" />
				{/if}
				{#if item.tab === 'palette'}
					<PaletteIcon weight="bold" />
				{/if}
				{#if item.tab === 'export'}
					<ExportIcon weight="bold" />
				{/if}
				{item.label}
			</z-button>
		{/each}
	</div>

	{#if activeTab !== null}
		<div class="toolbar-menu" role="dialog" aria-label="{activeTab} menu">
			{#if activeTab === 'settings'}
				<SettingsPanel />
			{/if}
			{#if activeTab === 'options'}
				<OptionsPanel />
			{/if}
			{#if activeTab === 'post'}
				<PostPanel />
			{/if}
			{#if activeTab === 'palette'}
				<PalettePanel />
			{/if}
			{#if activeTab === 'export'}
				<ExportPanel />
			{/if}
		</div>
	{/if}
</div>
