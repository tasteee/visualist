<script lang="ts">
	import { HIT_ROLE_OPTIONS, formatHitCount } from '../engine/hits'
	import type { MidiGroupingT, MidiTimingT } from '../engine/midi'
	import { formatBpm } from '../engine/timeline'
	import type { HitRoleT } from '../engine/types'
	import {
		closeMidiImport,
		confirmMidiImport,
		countNotesInSong,
		getMidiFileInfo,
		midiImport,
		setMidiGrouping,
		setMidiOffset,
		setMidiRowRole,
		setMidiTiming,
		updateMidiRow
	} from '../midiImport.svelte'
	import type { MidiImportRowT } from '../midiImport.svelte'
	import { getAnalysis } from '../store.svelte'
	import Segmented from './Segmented.svelte'
	import './MidiImportDialog.css'

	const GROUPING_OPTIONS = [
		{ value: 'note', label: 'One per note' },
		{ value: 'track', label: 'One per MIDI track' }
	]

	const TIMING_OPTIONS = [
		{ value: 'file', label: 'MIDI tempo' },
		{ value: 'song', label: 'Song tempo' }
	]

	const fileInfo = $derived(midiImport.isOpen ? getMidiFileInfo() : null)
	const songBpmLabel = $derived(formatBpm(getAnalysis().bpm))

	const buildTempoNote = (): string => {
		if (fileInfo === null) return ''
		const hasTempoMap = fileInfo.hasTempoMap
		if (!hasTempoMap) return `This file has no tempo map. Song tempo lays its beats on the song's ${songBpmLabel} BPM grid.`
		const midiBpmLabel = formatBpm(fileInfo.firstBpm)
		const hasTempoChanges = fileInfo.tempoChangeCount > 1
		const changesLabel = hasTempoChanges ? ` with ${fileInfo.tempoChangeCount} tempo changes` : ''
		return `MIDI ${midiBpmLabel} BPM${changesLabel} · song ${songBpmLabel} BPM. Song tempo lays the MIDI's beats on the song's grid.`
	}

	const tempoNote = $derived(buildTempoNote())
	const includedRows = $derived(midiImport.rows.filter((row) => row.isIncluded))
	const includedCount = $derived(includedRows.length)
	const hasIncluded = $derived(includedCount > 0)
	const importLabel = $derived(includedCount === 1 ? 'Import 1 track' : `Import ${includedCount} tracks`)

	const getRowDetail = (row: MidiImportRowT): string => {
		const inSong = countNotesInSong(row.key)
		const isAllInSong = inSong === row.noteCount
		const countLabel = formatHitCount(row.noteCount)
		if (isAllInSong) return countLabel
		return `${countLabel} · ${inSong} in the song`
	}

	const handleClose = () => closeMidiImport()

	const handleGroupingChange = (value: string) => setMidiGrouping(value as MidiGroupingT)

	const handleTimingChange = (value: string) => setMidiTiming(value as MidiTimingT)

	const handleOffsetChange = (event: Event) => {
		const detail = (event as CustomEvent<{ value: number }>).detail
		setMidiOffset(detail.value)
	}

	const handleIncludeChange = (row: MidiImportRowT, event: Event) => {
		const detail = (event as CustomEvent<{ checked: boolean }>).detail
		updateMidiRow(row.key, { isIncluded: detail.checked })
	}

	const handleNameChange = (row: MidiImportRowT, event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		updateMidiRow(row.key, { name: detail.value })
	}

	const handleRoleChange = (row: MidiImportRowT, event: Event) => {
		const detail = (event as CustomEvent<{ value: string }>).detail
		setMidiRowRole(row.key, detail.value as HitRoleT)
	}
</script>

<z-dialog isOpen={midiImport.isOpen} heading="Import MIDI" description={midiImport.fileName} onclose={handleClose}>
	<div class="midi-import">
		<div class="midi-import-options">
			<Segmented label="Make tracks" options={GROUPING_OPTIONS} value={midiImport.grouping} onchange={handleGroupingChange} />
			<div class="midi-import-timing">
				<Segmented label="Timing" options={TIMING_OPTIONS} value={midiImport.timing} onchange={handleTimingChange} />
				<z-field label="Offset (ms)">
					<z-number-input value={midiImport.offsetMs} min={-5000} max={5000} step={1} hasStepperButtons onchange={handleOffsetChange}></z-number-input>
				</z-field>
			</div>
			<p class="midi-import-note">{tempoNote}</p>
		</div>

		<ul class="midi-import-rows">
			{#each midiImport.rows as row (row.key)}
				<li class="midi-import-row" class:isExcluded={!row.isIncluded}>
					<z-checkbox isChecked={row.isIncluded} aria-label="Import {row.name}" onchange={(event: Event) => handleIncludeChange(row, event)}></z-checkbox>
					<div class="midi-import-row-main">
						<z-input size="sm" value={row.name} aria-label="Track name" onchange={(event: Event) => handleNameChange(row, event)} oninput={(event: Event) => handleNameChange(row, event)}></z-input>
						<span class="midi-import-row-detail">{getRowDetail(row)}</span>
					</div>
					<z-select class="midi-import-row-role" size="sm" value={row.role} options={HIT_ROLE_OPTIONS} aria-label="Role" onchange={(event: Event) => handleRoleChange(row, event)}></z-select>
				</li>
			{/each}
		</ul>
	</div>

	<div slot="footer" class="midi-import-footer">
		<z-button size="md" kind="ghost" tone="neutral" onclick={handleClose}>Cancel</z-button>
		<z-button size="md" kind="solid" tone="primary" isDisabled={!hasIncluded} onclick={confirmMidiImport}>{importLabel}</z-button>
	</div>
</z-dialog>
