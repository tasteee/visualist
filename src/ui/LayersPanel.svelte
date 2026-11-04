<script lang="ts">
	import ImageIcon from 'phosphor-svelte/lib/ImageIcon'
	import PenNibIcon from 'phosphor-svelte/lib/PenNibIcon'
	import TextTIcon from 'phosphor-svelte/lib/TextTIcon'
	import { addAssetLayer, addTextLayer, getSelectedLayer, layerStore, selectLayer, toggleLayerVisible } from '../layers.svelte'
	import type { LayerT } from '../engine/types'
	import { openLayerFilePicker } from './filePicker'
	import type { LayerFileKindT } from './filePicker'
	import LayerEditor from './LayerEditor.svelte'
	import LayerRow from './LayerRow.svelte'
	import Section from './Section.svelte'
	import './LayersPanel.css'

	// The list reads top to bottom as front to back, the way
	// design tools show a stack.
	const frontToBack = $derived([...layerStore.layers].reverse() as LayerT[])
	const selectedLayer = $derived(getSelectedLayer())
	const hasSelection = $derived(selectedLayer !== undefined)
	const isImporting = $derived(layerStore.isImporting)

	const handleAddText = () => addTextLayer()

	const handleAddFile = (kind: LayerFileKindT) => {
		openLayerFilePicker(kind, (file) => void addAssetLayer(file))
	}

	const handleSelect = (layerId: string) => {
		const isSelected = layerStore.selectedLayerId === layerId
		const nextId = isSelected ? null : layerId
		selectLayer(nextId)
	}
</script>

<Section title="Add" description="New layers go on top. Everything stays in the frame as you change format.">
	<div class="layers-panel-add">
		<button class="layers-panel-add-button" type="button" onclick={handleAddText}>
			<TextTIcon weight="bold" />
			<span>Text</span>
		</button>
		<button class="layers-panel-add-button" type="button" disabled={isImporting} onclick={() => handleAddFile('image')}>
			<ImageIcon weight="bold" />
			<span>Image</span>
		</button>
		<button class="layers-panel-add-button" type="button" disabled={isImporting} onclick={() => handleAddFile('svg')}>
			<PenNibIcon weight="bold" />
			<span>Vector</span>
		</button>
	</div>
</Section>

<Section title="Stack" description="Front to back. Select a layer to edit it.">
	<div class="layers-panel-list" role="list">
		{#each frontToBack as layer (layer.id)}
			<div role="listitem">
				<LayerRow
					{layer}
					isSelected={layerStore.selectedLayerId === layer.id}
					assetVersion={layerStore.assetVersion}
					onselect={() => handleSelect(layer.id)}
					ontogglevisible={() => toggleLayerVisible(layer.id)}
				/>
			</div>
		{/each}
	</div>
</Section>

{#if hasSelection && selectedLayer !== undefined}
	{#key selectedLayer.id}
		<LayerEditor layer={selectedLayer} />
	{/key}
{/if}
