<script lang="ts">
	import { automation } from '../automation.svelte'
	import { MODULATION_GROUP_ID } from '../engine/automation'
	import { mappingsStore, selectModulator } from '../mappings.svelte'
	import { sources } from '../sources.svelte'
	import ModulatorMappings from './ModulatorMappings.svelte'
	import './MappingWorkspace.css'

	const selectedModulator = $derived(mappingsStore.selectedModulator)
	const isSelectedEmitterAvailable = $derived(
		selectedModulator?.kind === 'emitter' && sources.tracks.some((track) => track.id === selectedModulator.trackId)
	)
	const isSelectedLaneAvailable = $derived(
		selectedModulator?.kind === 'lane' && automation.lanes.some((lane) => lane.id === selectedModulator.laneId)
	)
	const hasSelectedSource = $derived(isSelectedEmitterAvailable || isSelectedLaneAvailable)
	const modulationLanes = $derived(automation.lanes.filter((lane) => lane.target.kind === 'unset' && lane.target.groupId === MODULATION_GROUP_ID))
	const hasSources = $derived(sources.tracks.length > 0 || modulationLanes.length > 0)
	const getLaneDisplayName = (lane: (typeof automation.lanes)[number]): string => {
		return lane.name ?? 'Automation'
	}
	const selectedName = $derived.by(() => {
		if (selectedModulator?.kind === 'emitter') {
			const track = sources.tracks.find((candidate) => candidate.id === selectedModulator.trackId)
			return track?.name ?? ''
		}
		if (selectedModulator?.kind === 'lane') {
			const lane = automation.lanes.find((candidate) => candidate.id === selectedModulator.laneId)
			return lane === undefined ? '' : getLaneDisplayName(lane)
		}
		return ''
	})
</script>

<div class="mappingWorkspace">
	<nav class="mappingWorkspaceSources" aria-label="Modulation sources">
		<div class="mappingWorkspaceHeading">Sources</div>
		{#each sources.tracks as track (track.id)}
			{@const isSelected = selectedModulator?.kind === 'emitter' && selectedModulator.trackId === track.id}
			<button class="mappingWorkspaceSource" class:isSelected type="button" onclick={() => selectModulator({ kind: 'emitter', trackId: track.id })}>
				<span class="mappingWorkspaceSourceKind">Emitter</span>
				<span>{track.name}</span>
			</button>
		{/each}
		{#each modulationLanes as lane (lane.id)}
				{@const isSelected = selectedModulator?.kind === 'lane' && selectedModulator.laneId === lane.id}
				<button class="mappingWorkspaceSource" class:isSelected type="button" onclick={() => selectModulator({ kind: 'lane', laneId: lane.id })}>
					<span class="mappingWorkspaceSourceKind">Automation</span>
					<span>{getLaneDisplayName(lane)}</span>
				</button>
		{/each}
	</nav>
	<section class="mappingWorkspaceContent" aria-label="Mappings">
		{#if hasSelectedSource && selectedModulator !== null}
			<header class="mappingWorkspaceContentHeader">
				<span class="mappingWorkspaceEyebrow">Mapping source</span>
				<h2>{selectedName}</h2>
			</header>
			<ModulatorMappings modulator={selectedModulator} />
		{:else}
			<div class="mappingWorkspaceEmpty">
				<h2>{hasSources ? 'Select a source' : 'No modulation sources yet'}</h2>
				<p>{hasSources ? 'Choose an emitter or automation lane to connect it to layer and clip controls.' : 'Create an emitter or automation lane in Modulation, then connect it here.'}</p>
			</div>
		{/if}
	</section>
</div>
