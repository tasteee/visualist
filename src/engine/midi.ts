import type { HitRoleT } from './types'

// A small Standard MIDI File reader: notes, tempo map and track
// names. Enough to turn a drum export into hit tracks.

export type MidiNoteT = {
	trackIndex: number
	trackName: string
	channel: number
	pitch: number
	velocity: number
	startBeat: number
	endBeat: number
	startSeconds: number
	endSeconds: number
}

export type MidiFileT = {
	notes: MidiNoteT[]
	hasTempoMap: boolean
	firstBpm: number
	tempoChangeCount: number
}

// file follows the MIDI's own tempo map. song lays the MIDI's
// beats onto the song's tempo and downbeat instead, for exports
// with no tempo map or the wrong one.
export type MidiTimingT = 'file' | 'song'

export type MidiGroupingT = 'note' | 'track'

export type MidiGroupT = {
	key: string
	name: string
	role: HitRoleT
	notes: MidiNoteT[]
}

type TempoEventT = {
	tick: number
	microsPerBeat: number
}

type RawNoteT = {
	trackIndex: number
	channel: number
	pitch: number
	velocity: number
	startTick: number
	endTick: number
}

type ReaderT = {
	view: DataView
	offset: number
}

type TrackResultT = {
	name: string
	notes: RawNoteT[]
	tempos: TempoEventT[]
}

type TimeBaseT = {
	ticksPerBeat: number
	secondsPerTick: number | null
}

const DEFAULT_MICROS_PER_BEAT = 500_000
const DRUM_CHANNEL = 9
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const GENERAL_MIDI_DRUMS: Record<number, string> = {
	35: 'Kick',
	36: 'Kick',
	37: 'Side stick',
	38: 'Snare',
	39: 'Clap',
	40: 'Snare',
	41: 'Low tom',
	42: 'Closed hat',
	43: 'Low tom',
	44: 'Pedal hat',
	45: 'Mid tom',
	46: 'Open hat',
	47: 'Mid tom',
	48: 'High tom',
	49: 'Crash',
	50: 'High tom',
	51: 'Ride',
	54: 'Tambourine',
	56: 'Cowbell',
	57: 'Crash',
	59: 'Ride'
}

const readByte = (reader: ReaderT): number => {
	const value = reader.view.getUint8(reader.offset)
	reader.offset += 1
	return value
}

const readText = (reader: ReaderT, length: number): string => {
	const bytes = new Uint8Array(reader.view.buffer, reader.view.byteOffset + reader.offset, length)
	reader.offset += length
	return new TextDecoder().decode(bytes)
}

// Variable-length quantity: seven bits per byte, high bit set
// on every byte but the last. Never more than four bytes.
const readVarLength = (reader: ReaderT): number => {
	let value = 0
	for (const _ of [0, 1, 2, 3]) {
		const byte = readByte(reader)
		value = (value << 7) | (byte & 0x7f)
		const isLast = (byte & 0x80) === 0
		if (isLast) return value
	}
	return value
}

const readChunkHeader = (reader: ReaderT): { id: string; length: number } => {
	const id = readText(reader, 4)
	const length = reader.view.getUint32(reader.offset)
	reader.offset += 4
	return { id, length }
}

const readTimeBase = (division: number): TimeBaseT => {
	const isSmpte = (division & 0x8000) !== 0
	if (!isSmpte) return { ticksPerBeat: division, secondsPerTick: null }
	const framesPerSecond = 256 - (division >> 8)
	const ticksPerFrame = division & 0xff
	const secondsPerTick = 1 / (framesPerSecond * ticksPerFrame)
	return { ticksPerBeat: 480, secondsPerTick }
}

type OpenNotesT = Map<string, { startTick: number; velocity: number }[]>

const openNote = (openNotes: OpenNotesT, key: string, startTick: number, velocity: number): void => {
	const stack = openNotes.get(key) ?? []
	stack.push({ startTick, velocity })
	openNotes.set(key, stack)
}

// Overlapping notes on one pitch close first in, first out.
const closeNote = (openNotes: OpenNotesT, key: string): { startTick: number; velocity: number } | null => {
	const stack = openNotes.get(key)
	const hasOpen = stack !== undefined && stack.length > 0
	if (!hasOpen) return null
	return stack.shift() ?? null
}

const readTrack = (reader: ReaderT, end: number, trackIndex: number): TrackResultT => {
	const result: TrackResultT = { name: '', notes: [], tempos: [] }
	const openNotes: OpenNotesT = new Map()
	let tick = 0
	let runningStatus = 0

	const handleNoteOff = (channel: number, pitch: number) => {
		const key = `${channel}:${pitch}`
		const opened = closeNote(openNotes, key)
		if (opened === null) return
		result.notes.push({ trackIndex, channel, pitch, velocity: opened.velocity, startTick: opened.startTick, endTick: tick })
	}

	while (reader.offset < end) {
		tick += readVarLength(reader)
		const peek = reader.view.getUint8(reader.offset)
		const isStatusByte = (peek & 0x80) !== 0
		if (isStatusByte) reader.offset += 1
		const status = isStatusByte ? peek : runningStatus

		const isMeta = status === 0xff
		if (isMeta) {
			const metaType = readByte(reader)
			const length = readVarLength(reader)
			const dataStart = reader.offset
			const isTempo = metaType === 0x51 && length === 3
			const isTrackName = metaType === 0x03
			if (isTempo) {
				const microsPerBeat = (readByte(reader) << 16) | (readByte(reader) << 8) | readByte(reader)
				result.tempos.push({ tick, microsPerBeat })
			}
			if (isTrackName) result.name = readText(reader, length).trim()
			reader.offset = dataStart + length
			continue
		}

		const isSysex = status === 0xf0 || status === 0xf7
		if (isSysex) {
			const length = readVarLength(reader)
			reader.offset += length
			continue
		}

		runningStatus = status
		const kind = status & 0xf0
		const channel = status & 0x0f
		const hasOneDataByte = kind === 0xc0 || kind === 0xd0
		const first = readByte(reader)
		const second = hasOneDataByte ? 0 : readByte(reader)
		const isNoteOn = kind === 0x90 && second > 0
		const isNoteOff = kind === 0x80 || (kind === 0x90 && second === 0)
		if (isNoteOn) openNote(openNotes, `${channel}:${first}`, tick, second)
		if (isNoteOff) handleNoteOff(channel, first)
	}

	return result
}

const sortTempos = (tempos: TempoEventT[]): TempoEventT[] => {
	const sorted = [...tempos].sort((first, second) => first.tick - second.tick)
	const startsWithTempo = sorted.length > 0 && sorted[0].tick === 0
	if (startsWithTempo) return sorted
	return [{ tick: 0, microsPerBeat: DEFAULT_MICROS_PER_BEAT }, ...sorted]
}

// Seconds at a tick, walking the tempo map segment by segment.
const buildTickToSeconds = (tempos: TempoEventT[], timeBase: TimeBaseT): ((tick: number) => number) => {
	const fixedSecondsPerTick = timeBase.secondsPerTick
	const hasFixedRate = fixedSecondsPerTick !== null
	if (hasFixedRate) return (tick: number) => tick * fixedSecondsPerTick

	const segmentStarts: number[] = []
	let elapsed = 0
	for (const [index, tempo] of tempos.entries()) {
		segmentStarts.push(elapsed)
		const next = tempos[index + 1]
		if (next === undefined) continue
		const ticks = next.tick - tempo.tick
		elapsed += (ticks * tempo.microsPerBeat) / 1_000_000 / timeBase.ticksPerBeat
	}

	return (tick: number) => {
		const segmentIndex = tempos.findLastIndex((tempo) => tempo.tick <= tick)
		const safeIndex = Math.max(0, segmentIndex)
		const tempo = tempos[safeIndex]
		const ticksIntoSegment = tick - tempo.tick
		const secondsIntoSegment = (ticksIntoSegment * tempo.microsPerBeat) / 1_000_000 / timeBase.ticksPerBeat
		return segmentStarts[safeIndex] + secondsIntoSegment
	}
}

export const parseMidi = (buffer: ArrayBuffer): MidiFileT => {
	const reader: ReaderT = { view: new DataView(buffer), offset: 0 }
	const header = readChunkHeader(reader)
	const isMidi = header.id === 'MThd'
	if (!isMidi) throw new Error('Not a MIDI file')

	const headerEnd = reader.offset + header.length
	reader.offset += 2
	const trackCount = reader.view.getUint16(reader.offset)
	reader.offset += 2
	const division = reader.view.getUint16(reader.offset)
	reader.offset = headerEnd
	const timeBase = readTimeBase(division)

	const tracks: TrackResultT[] = []
	for (const trackIndex of Array.from({ length: trackCount }, (_, index) => index)) {
		const hasRoom = reader.offset + 8 <= reader.view.byteLength
		if (!hasRoom) break
		const chunk = readChunkHeader(reader)
		const chunkEnd = Math.min(reader.view.byteLength, reader.offset + chunk.length)
		const isTrack = chunk.id === 'MTrk'
		if (isTrack) tracks.push(readTrack(reader, chunkEnd, trackIndex))
		reader.offset = chunkEnd
	}

	const allTempos = tracks.flatMap((track) => track.tempos)
	const tempos = sortTempos(allTempos)
	const tickToSeconds = buildTickToSeconds(tempos, timeBase)
	const rawNotes = tracks.flatMap((track) => track.notes)
	const trackNames = tracks.map((track) => track.name)

	const notes: MidiNoteT[] = rawNotes.map((note) => ({
		trackIndex: note.trackIndex,
		trackName: trackNames[note.trackIndex] ?? '',
		channel: note.channel,
		pitch: note.pitch,
		velocity: note.velocity,
		startBeat: note.startTick / timeBase.ticksPerBeat,
		endBeat: note.endTick / timeBase.ticksPerBeat,
		startSeconds: tickToSeconds(note.startTick),
		endSeconds: tickToSeconds(note.endTick)
	}))
	notes.sort((first, second) => first.startSeconds - second.startSeconds)

	const firstBpm = 60_000_000 / tempos[0].microsPerBeat
	const hasTempoMap = allTempos.length > 0

	return { notes, hasTempoMap, firstBpm, tempoChangeCount: allTempos.length }
}

// Middle C is C3, as in most DAWs, so a kick on 36 reads C1.
export const getNoteName = (pitch: number): string => {
	const octave = Math.floor(pitch / 12) - 2
	return `${NOTE_NAMES[pitch % 12]}${octave}`
}

const getDrumName = (pitch: number): string | null => GENERAL_MIDI_DRUMS[pitch] ?? null

export const guessRole = (name: string): HitRoleT => {
	const lowered = name.toLowerCase()
	const isKick = lowered.includes('kick') || lowered.includes('bd')
	if (isKick) return 'kick'
	const isSnare = lowered.includes('snare') || lowered.includes('clap') || lowered.includes('sd')
	if (isSnare) return 'snare'
	return 'none'
}

const buildNoteGroupName = (note: MidiNoteT): string => {
	const drumName = getDrumName(note.pitch)
	const noteName = getNoteName(note.pitch)
	const isDrumChannel = note.channel === DRUM_CHANNEL
	const hasTrackName = note.trackName !== ''
	if (drumName !== null) return `${drumName} · ${noteName}`
	if (hasTrackName) return `${note.trackName} · ${noteName}`
	if (isDrumChannel) return `Drum ${noteName}`
	return noteName
}

const buildTrackGroupName = (note: MidiNoteT): string => {
	const hasTrackName = note.trackName !== ''
	if (hasTrackName) return note.trackName
	return `Track ${note.trackIndex + 1}`
}

// Only one group per role, so the first kick-like and the
// first snare-like groups take those roles.
const assignRoles = (groups: MidiGroupT[]): MidiGroupT[] => {
	const takenRoles = new Set<HitRoleT>()
	return groups.map((group) => {
		const role = guessRole(group.name)
		const isTaken = takenRoles.has(role)
		const isRole = role !== 'none'
		const shouldTake = isRole && !isTaken
		if (shouldTake) takenRoles.add(role)
		const assignedRole = shouldTake ? role : 'none'
		return { ...group, role: assignedRole }
	})
}

export const groupMidiNotes = (notes: MidiNoteT[], grouping: MidiGroupingT): MidiGroupT[] => {
	const groups = new Map<string, MidiGroupT>()
	const isByNote = grouping === 'note'

	for (const note of notes) {
		const key = isByNote ? `${note.trackIndex}:${note.pitch}` : `${note.trackIndex}`
		const existing = groups.get(key)
		if (existing !== undefined) {
			existing.notes.push(note)
			continue
		}
		const name = isByNote ? buildNoteGroupName(note) : buildTrackGroupName(note)
		groups.set(key, { key, name, role: 'none', notes: [note] })
	}

	const sorted = Array.from(groups.values()).sort((first, second) => second.notes.length - first.notes.length)
	return assignRoles(sorted)
}

export type MidiPlacementT = {
	timing: MidiTimingT
	offsetSeconds: number
	bpm: number
	beatOffset: number
}

export type PlacedNoteT = {
	time: number
	length: number
	strength: number
}

export const placeMidiNote = (note: MidiNoteT, placement: MidiPlacementT): PlacedNoteT => {
	const beatLength = 60 / Math.max(1, placement.bpm)
	const isSongTiming = placement.timing === 'song'
	const songStart = placement.beatOffset + note.startBeat * beatLength
	const songEnd = placement.beatOffset + note.endBeat * beatLength
	const start = isSongTiming ? songStart : note.startSeconds
	const end = isSongTiming ? songEnd : note.endSeconds
	return {
		time: start + placement.offsetSeconds,
		length: Math.max(0, end - start),
		strength: note.velocity / 127
	}
}
