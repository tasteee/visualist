import { toaster } from '@tasteee/zest'
import { groupMidiNotes, parseMidi, placeMidiNote } from './engine/midi'
import type { MidiFileT, MidiGroupT, MidiGroupingT, MidiPlacementT, MidiTimingT } from './engine/midi'
import type { HitRoleT } from './engine/types'
import { showInspectorTab } from './inspector.svelte'
import { addTracksFromMidi } from './sources.svelte'
import { app, getAnalysis, setStatus } from './store.svelte'

// One row per note group in the import dialog. The user can
// rename it, give it a role, or leave it out.
export type MidiImportRowT = {
	key: string
	name: string
	role: HitRoleT
	isIncluded: boolean
	noteCount: number
}

type MidiImportStateT = {
	isOpen: boolean
	fileName: string
	grouping: MidiGroupingT
	timing: MidiTimingT
	offsetMs: number
	rows: MidiImportRowT[]
}

const MIDI_EXTENSIONS = ['.mid', '.midi']

// The parsed file lives outside the proxy: it can hold tens of
// thousands of notes and never changes once read.
let parsedMidi: MidiFileT | null = null
let groups: MidiGroupT[] = []

export const midiImport = $state<MidiImportStateT>({
	isOpen: false,
	fileName: '',
	grouping: 'note',
	timing: 'file',
	offsetMs: 0,
	rows: []
})

export const checkIsMidiFile = (file: File): boolean => {
	const lowered = file.name.toLowerCase()
	const hasMidiExtension = MIDI_EXTENSIONS.some((extension) => lowered.endsWith(extension))
	const hasMidiType = file.type === 'audio/midi' || file.type === 'audio/x-midi'
	return hasMidiExtension || hasMidiType
}

const buildRows = (nextGroups: MidiGroupT[]): MidiImportRowT[] => {
	return nextGroups.map((group) => ({
		key: group.key,
		name: group.name,
		role: group.role,
		isIncluded: true,
		noteCount: group.notes.length
	}))
}

const regroup = (): void => {
	if (parsedMidi === null) return
	groups = groupMidiNotes(parsedMidi.notes, midiImport.grouping)
	midiImport.rows = buildRows(groups)
}

export const getMidiFileInfo = (): MidiFileT | null => parsedMidi

export const openMidiFile = async (file: File): Promise<void> => {
	try {
		const bytes = await file.arrayBuffer()
		const parsed = parseMidi(bytes)
		const hasNotes = parsed.notes.length > 0
		if (!hasNotes) throw new Error('No notes')
		parsedMidi = parsed
		midiImport.fileName = file.name
		midiImport.grouping = 'note'
		midiImport.timing = parsed.hasTempoMap ? 'file' : 'song'
		midiImport.offsetMs = 0
		regroup()
		midiImport.isOpen = true
	} catch {
		const message = 'That MIDI file could not be read, or it has no notes.'
		setStatus(message, 'danger')
		toaster.show({ title: 'Could not import MIDI', description: message, tone: 'danger' })
	}
}

export const closeMidiImport = (): void => {
	midiImport.isOpen = false
}

export const setMidiGrouping = (grouping: MidiGroupingT): void => {
	midiImport.grouping = grouping
	regroup()
}

export const setMidiTiming = (timing: MidiTimingT): void => {
	midiImport.timing = timing
}

export const setMidiOffset = (offsetMs: number): void => {
	midiImport.offsetMs = offsetMs
}

export const updateMidiRow = (key: string, changes: Partial<MidiImportRowT>): void => {
	const row = midiImport.rows.find((candidate) => candidate.key === key)
	if (row === undefined) return
	Object.assign(row, changes)
}

// Only one row may drive each role, like the tracks themselves.
export const setMidiRowRole = (key: string, role: HitRoleT): void => {
	const isRole = role !== 'none'
	for (const row of midiImport.rows) {
		const isOtherOwner = isRole && row.key !== key && row.role === role
		if (isOtherOwner) row.role = 'none'
	}
	updateMidiRow(key, { role })
}

export const getMidiPlacement = (): MidiPlacementT => {
	const analysis = getAnalysis()
	return {
		timing: midiImport.timing,
		offsetSeconds: midiImport.offsetMs / 1000,
		bpm: analysis.bpm,
		beatOffset: analysis.beatOffset
	}
}

// How many of a group's notes would land inside the song.
export const countNotesInSong = (key: string): number => {
	const group = groups.find((candidate) => candidate.key === key)
	if (group === undefined) return 0
	const placement = getMidiPlacement()
	const placed = group.notes.map((note) => placeMidiNote(note, placement))
	return placed.filter((note) => note.time >= 0 && note.time <= app.duration).length
}

export const confirmMidiImport = (): void => {
	const includedRows = midiImport.rows.filter((row) => row.isIncluded)
	const imports = includedRows.flatMap((row) => {
		const group = groups.find((candidate) => candidate.key === row.key)
		if (group === undefined) return []
		return [{ group, name: row.name, role: row.role }]
	})
	const importedCount = addTracksFromMidi(imports, getMidiPlacement())
	midiImport.isOpen = false
	const hasImported = importedCount > 0
	if (!hasImported) return
	const trackLabel = importedCount === 1 ? '1 hit track' : `${importedCount} hit tracks`
	setStatus(`Imported ${trackLabel} from ${midiImport.fileName}`, 'success')
	showInspectorTab('sources')
}
