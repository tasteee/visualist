<script lang="ts">
	import { HIT_ROLE_OPTIONS, formatHitCount } from '../engine/hits'
	import { MAX_TRACK_DECAY, MIN_TRACK_DECAY, getTrackSourceId } from '../engine/sources'
	import type { HitRoleT, HitShapeT, HitTrackT } from '../engine/types'
	import { removeTrack, renameTrack, setTrackDecay, setTrackRole, setTrackShape } from '../sources.svelte'
	import { getLiveSignals } from '../store.svelte'
	import Segmented from './Segmented.svelte'
	import SettingSlider from './SettingSlider.svelte'
	import SourceCard from './SourceCard.svelte'

	type HitTrackCardPropsT = {
		track: HitTrackT
	}

	const props: HitTrackCardPropsT = $props()

	const SHAPE_OPTIONS = [
		{ value: 'pulse', label: 'Pulse' },
		{ value: 'gate', label: 'Hold notes' }
	]

	const tone = $derived(props.track.role === 'none' ? 'hits' : props.track.role)
	const sourceId = $derived(getTrackSourceId(props.track.id))
	const liveLevel = $derived(getLiveSignals()[sourceId] ?? 0)
	const metaLabel = $derived(formatHitCount(props.track.hits.length))
	const isGate = $derived(props.track.shape === 'gate')
	const shapeHint = $derived(isGate ? 'Full strength for each note’s length, then fades.' : 'Jumps on each hit, then fades.')

	const handleRename = (name: string) => renameTrack(props.track.id, name)

	const handleRemove = () => removeTrack(props.track.id)

	const handleRoleChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		setTrackRole(props.track.id, detail.value as HitRoleT)
	}

	const handleShapeChange = (value: string) => setTrackShape(props.track.id, value as HitShapeT)

	const handleDecayChange = (value: number) => setTrackDecay(props.track.id, value)
</script>

<SourceCard tone={tone} name={props.track.name} meta={metaLabel} level={liveLevel} removeLabel="Remove track" onrename={handleRename} onremove={handleRemove}>
	<z-field label="Role">
		<z-select size="sm" value={props.track.role} options={HIT_ROLE_OPTIONS} aria-label="Role" onchange={handleRoleChange}></z-select>
	</z-field>
	<Segmented label="Shape" options={SHAPE_OPTIONS} value={props.track.shape} onchange={handleShapeChange} />
	<SettingSlider label="Fade" hint={shapeHint} value={props.track.decay} min={MIN_TRACK_DECAY} max={MAX_TRACK_DECAY} step={0.01} suffix=" s" onchange={handleDecayChange} />
</SourceCard>
