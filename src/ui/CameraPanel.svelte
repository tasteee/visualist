<script lang="ts">
	import { app } from '../store.svelte'
	import ControlSlider from './ControlSlider.svelte'
	import Section from './Section.svelte'

	const isMoved = $derived(app.settings.cameraOrbit !== 0 || app.settings.cameraTilt !== 0 || app.settings.cameraDistance !== 1)

	const resetCamera = () => {
		app.settings.cameraOrbit = 0
		app.settings.cameraTilt = 0
		app.settings.cameraDistance = 1
	}
</script>

<Section title="Camera" description="Looks at the frame in 3D. Give layers Depth to pull them toward the camera.">
	<ControlSlider controlKey="cameraOrbit" label="Orbit" hint="Swings the camera left and right around the frame." />
	<ControlSlider controlKey="cameraTilt" label="Tilt" hint="Swings the camera up and down around the frame." />
	<ControlSlider controlKey="cameraDistance" label="Distance" hint="Below 1 pushes in, above 1 pulls back." />
	<z-button size="md" kind="outline" tone="neutral" isDisabled={!isMoved} onclick={resetCamera}>Reset camera</z-button>
</Section>
