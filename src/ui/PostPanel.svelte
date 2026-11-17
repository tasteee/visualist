<script lang="ts">
	import { onMount } from 'svelte'
	import { checkIsPostAvailable } from '../engine/post'
	import CameraPanel from './CameraPanel.svelte'
	import ControlSlider from './ControlSlider.svelte'
	import Section from './Section.svelte'

	let isAvailable = $state(true)

	onMount(() => {
		isAvailable = checkIsPostAvailable()
	})
</script>

<CameraPanel />

<Section title="Lens">
	<ControlSlider
		controlKey="bloomAmount"
		label="Bloom"
		hint="Accents glow. In dark mode, bright areas glow too."
		isDisabled={!isAvailable}
	/>
	<ControlSlider
		controlKey="aberrationAmount"
		label="Chromatic aberration"
		hint="Red and blue drift apart toward the edges."
		isDisabled={!isAvailable}
	/>
	<ControlSlider
		controlKey="warpAmount"
		label="Warp"
		hint="A slow liquid wave across the picture."
		isDisabled={!isAvailable}
	/>
</Section>

<Section title="Film">
	<ControlSlider controlKey="scanlineAmount" label="Scanlines" isDisabled={!isAvailable} />
	<ControlSlider controlKey="noiseAmount" label="Film noise" isDisabled={!isAvailable} />
	<ControlSlider controlKey="vignetteAmount" label="Vignette" isDisabled={!isAvailable} />
</Section>
