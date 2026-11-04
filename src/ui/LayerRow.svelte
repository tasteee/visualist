<script lang="ts">
	import EyeIcon from 'phosphor-svelte/lib/EyeIcon'
	import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlashIcon'
	import ImageIcon from 'phosphor-svelte/lib/ImageIcon'
	import PenNibIcon from 'phosphor-svelte/lib/PenNibIcon'
	import SparkleIcon from 'phosphor-svelte/lib/SparkleIcon'
	import TextTIcon from 'phosphor-svelte/lib/TextTIcon'
	import { getAsset } from '../engine/assets'
	import type { LayerKindT, LayerT } from '../engine/types'
	import './LayerRow.css'

	type LayerRowPropsT = {
		layer: LayerT
		isSelected: boolean
		assetVersion: number
		onselect: () => void
		ontogglevisible: () => void
	}

	const props: LayerRowPropsT = $props()

	const KIND_LABELS: Record<LayerKindT, string> = { logo: 'Logo scene', text: 'Text', image: 'Image', svg: 'Vector' }

	const isLogo = $derived(props.layer.kind === 'logo')
	const isText = $derived(props.layer.kind === 'text')
	const isImage = $derived(props.layer.kind === 'image')
	const isSvg = $derived(props.layer.kind === 'svg')
	const isHidden = $derived(!props.layer.isVisible)
	const fxCount = $derived(props.layer.fx.length)
	const hasFx = $derived(fxCount > 0)
	const fxLabel = $derived(fxCount === 1 ? '1 effect' : `${fxCount} effects`)
	const kindLabel = $derived(KIND_LABELS[props.layer.kind])

	const getIsMissingFile = (): boolean => {
		void props.assetVersion
		const isAssetLayer = props.layer.kind === 'image' || props.layer.kind === 'svg'
		if (!isAssetLayer) return false
		return getAsset(props.layer.assetId) === null
	}

	const isMissingFile = $derived(getIsMissingFile())
	const detailLabel = $derived(isMissingFile ? 'File missing' : kindLabel)
	const visibilityLabel = $derived(isHidden ? `Show ${props.layer.name}` : `Hide ${props.layer.name}`)
</script>

<div class="layer-row" class:isSelected={props.isSelected} class:isHidden>
	<button class="layer-row-main" type="button" aria-pressed={props.isSelected} onclick={props.onselect}>
		<span class="layer-row-icon" aria-hidden="true">
			{#if isLogo}
				<SparkleIcon weight="fill" />
			{/if}
			{#if isText}
				<TextTIcon weight="bold" />
			{/if}
			{#if isImage}
				<ImageIcon weight="bold" />
			{/if}
			{#if isSvg}
				<PenNibIcon weight="bold" />
			{/if}
		</span>
		<span class="layer-row-text">
			<span class="layer-row-name">{props.layer.name}</span>
			<span class="layer-row-detail" class:isWarning={isMissingFile}>
				{detailLabel}
				{#if hasFx}
					<span class="layer-row-fx">· {fxLabel}</span>
				{/if}
			</span>
		</span>
	</button>
	<z-tooltip content={visibilityLabel} placement="left" openDelay={400}>
		<button class="layer-row-visibility" type="button" aria-label={visibilityLabel} aria-pressed={isHidden} onclick={props.ontogglevisible}>
			{#if isHidden}
				<EyeSlashIcon weight="bold" />
			{/if}
			{#if !isHidden}
				<EyeIcon weight="bold" />
			{/if}
		</button>
	</z-tooltip>
</div>
