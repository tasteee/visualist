<script lang="ts">
	import ImageIcon from 'phosphor-svelte/lib/ImageIcon'
	import PenNibIcon from 'phosphor-svelte/lib/PenNibIcon'
	import TextTIcon from 'phosphor-svelte/lib/TextTIcon'
	import { addAssetLayer, addTextLayer, layerStore } from '../layers.svelte'
	import { openLayerFilePicker } from './filePicker'
	import type { LayerFileKindT } from './filePicker'
	import Section from './Section.svelte'
	import './LayersPanel.css'

	const isImporting = $derived(layerStore.isImporting)

	const handleAddText = () => addTextLayer()

	const handleAddFile = (kind: LayerFileKindT) => {
		openLayerFilePicker(kind, (file) => void addAssetLayer(file))
	}

</script>

<Section title="Add" description="New layers go on top. To edit one, click it on the stage or right-click its row in the timeline.">
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
