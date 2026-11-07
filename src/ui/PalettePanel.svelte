<script lang="ts">
	import { app } from '../store.svelte'
	import ColorRow from './ColorRow.svelte'
	import Section from './Section.svelte'

	// The four colors the whole picture is drawn from.
</script>

<Section title="Palette" description="Accents tint the effects. Background and foreground set the base of every frame.">
	<ColorRow label="Accent 1" value={app.settings.accent1} onchange={(value) => (app.settings.accent1 = value)} />
	<ColorRow label="Accent 2" value={app.settings.accent2} onchange={(value) => (app.settings.accent2 = value)} />
	<ColorRow label="Background" value={app.settings.background} onchange={(value) => (app.settings.background = value)} />
	<ColorRow label="Foreground" value={app.settings.foreground} onchange={(value) => (app.settings.foreground = value)} />
</Section>
