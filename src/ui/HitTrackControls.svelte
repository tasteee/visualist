<script lang="ts">
	import { HIT_ROLE_OPTIONS } from '../engine/hits'
	import { MAX_TRACK_DECAY, MIN_TRACK_DECAY } from '../engine/sources'
	import type { HitRoleT, HitShapeT, HitTrackT } from '../engine/types'
	import { recordHistory } from '../automation.svelte'
	import { setTrackDecay, setTrackRole, setTrackShape } from '../sources.svelte'
	import Segmented from './Segmented.svelte'
	import SettingSlider from './SettingSlider.svelte'

	// What an impulse lane owns besides its name and color: the
	// role it plays, how each impulse is shaped and how it fades.
	type HitTrackControlsPropsT = {
		track: HitTrackT
	}

	const props: HitTrackControlsPropsT = $props()

	const SHAPE_OPTIONS = [
		{ value: 'pulse', label: 'Pulse' },
		{ value: 'gate', label: 'Hold notes' }
	]

	const isGate = $derived(props.track.shape === 'gate')
	const shapeHint = $derived(isGate ? 'Full strength for each note’s length, then fades.' : 'Jumps on each impulse, then fades.')

	const handleRoleChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		setTrackRole(props.track.id, detail.value as HitRoleT)
	}

	const handleShapeChange = (value: string) => setTrackShape(props.track.id, value as HitShapeT)

	const handleDecayChange = (value: number) => setTrackDecay(props.track.id, value)
</script>

<z-field label="Role">
	<z-select size="sm" value={props.track.role} options={HIT_ROLE_OPTIONS} aria-label="Role" onchange={handleRoleChange}></z-select>
</z-field>
<Segmented label="Shape" options={SHAPE_OPTIONS} value={props.track.shape} onchange={handleShapeChange} />
<SettingSlider label="Fade" hint={shapeHint} value={props.track.decay} min={MIN_TRACK_DECAY} max={MAX_TRACK_DECAY} step={0.01} suffix=" s" onchange={handleDecayChange} />
