import { recordHistory, recordHistoryCoalesced } from './automation.svelte'
import { BAND_PRESETS, buildBand, clampBandRange } from './engine/bands'
import type { BandRangeT } from './engine/bands'
import { DEFAULT_IMPULSE_STRENGTH, MIN_IMPULSE_GAP, buildImpulseTrack, convertDetectedImpulses, createImpulse, insertImpulse, replaceImpulsesInRange } from './engine/impulses'
import type { TempoT, TimeRangeT } from './engine/impulses'
import { placeMidiNote } from './engine/midi'
import type { MidiGroupT, MidiPlacementT } from './engine/midi'
import { clamp } from './engine/settings'
import {
	MAX_BAND_RELEASE,
	MAX_TRACK_DECAY,
	MIN_BAND_RELEASE,
	MIN_TRACK_DECAY,
	compileBand,
	compileTrack,
	getTrackSourceId,
	sortImpulsesByTime
} from './engine/sources'
import type {
	BandOutputT,
	BandSourceT,
	CompiledBandT,
	CompiledSourcesT,
	ImpulseRoleT,
	ImpulseShapeT,
	ImpulseT,
	ImpulseTrackT,
	SpectrumT,
	TrackImpulseT
} from './engine/types'
import { app, getDetectedAnalysis } from './store.svelte'

type SourcesStateT = {
	tracks: ImpulseTrackT[]
	bands: BandSourceT[]
	// Impulse tracks belong to one song. This names it.
	songKey: string
	armedTrackId: string | null
	isTapQuantized: boolean
	// Selected impulses, all on one track at a time.
	impulseSelection: ImpulseSelectionT
	collapsedTrackIds: string[]
	isTriggersCollapsed: boolean
}

export type ImpulseSelectionT = {
	trackId: string | null
	impulseIds: string[]
}

// Where an impulse moves to, for moving several at once.
export type ImpulseMoveT = {
	impulseId: string
	time: number
	strength: number
}

export type RoleImpulsesT = {
	kicks: ImpulseT[] | null
	snaps: ImpulseT[] | null
}

const TRACKS_KEY = 'vink.hitTracks.v1'
const BANDS_KEY = 'vink.bands.v1'
export const DEMO_SONG_KEY = 'demo'

type StoredTracksT = Record<string, ImpulseTrackT[]>

const readStored = (key: string): unknown => {
	try {
		const stored = window.localStorage.getItem(key)
		if (stored === null) return null
		return JSON.parse(stored)
	} catch {
		return null
	}
}

const writeStored = (key: string, value: unknown): void => {
	try {
		window.localStorage.setItem(key, JSON.stringify(value))
	} catch {
		return
	}
}

// Tracks saved before the rename kept their impulses in hits.
const migrateStoredTrack = (track: Partial<ImpulseTrackT> & { hits?: unknown }): Partial<ImpulseTrackT> => {
	const hasLegacyHits = Array.isArray(track.hits) && !Array.isArray(track.impulses)
	if (!hasLegacyHits) return track
	return { ...track, impulses: track.hits as ImpulseTrackT['impulses'] }
}

const checkIsTrackShape = (track: Partial<ImpulseTrackT>): boolean => {
	const hasId = typeof track.id === 'string'
	const hasName = typeof track.name === 'string'
	const hasImpulses = Array.isArray(track.impulses)
	return hasId && hasName && hasImpulses
}

const checkIsBandShape = (band: Partial<BandSourceT>): boolean => {
	const hasId = typeof band.id === 'string'
	const hasRange = typeof band.lowHz === 'number' && typeof band.highHz === 'number'
	return hasId && hasRange
}

const readStoredTracks = (): StoredTracksT => {
	const parsed = readStored(TRACKS_KEY)
	const isObject = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
	if (!isObject) return {}
	return parsed as StoredTracksT
}

const loadTracks = (songKey: string): ImpulseTrackT[] => {
	const stored = readStoredTracks()[songKey]
	const isList = Array.isArray(stored)
	if (!isList) return []
	return (stored as Partial<ImpulseTrackT>[]).map(migrateStoredTrack).filter(checkIsTrackShape) as ImpulseTrackT[]
}

const saveTracks = (songKey: string, tracks: ImpulseTrackT[]): void => {
	const stored = readStoredTracks()
	const hasTracks = tracks.length > 0
	if (hasTracks) stored[songKey] = tracks
	if (!hasTracks) delete stored[songKey]
	writeStored(TRACKS_KEY, stored)
}

// Bands saved before the rename called their output hits.
const migrateStoredBand = (band: Partial<BandSourceT> & { output?: unknown }): Partial<BandSourceT> => {
	const isLegacyOutput = (band.output as unknown) === 'hits'
	if (!isLegacyOutput) return band
	return { ...band, output: 'impulses' }
}

const loadBands = (): BandSourceT[] => {
	const parsed = readStored(BANDS_KEY)
	const isList = Array.isArray(parsed)
	if (!isList) return []
	const bands = (parsed as Partial<BandSourceT>[]).map(migrateStoredBand)
	return bands.filter(checkIsBandShape) as BandSourceT[]
}

export const sources = $state<SourcesStateT>({
	tracks: loadTracks(DEMO_SONG_KEY),
	bands: loadBands(),
	songKey: DEMO_SONG_KEY,
	armedTrackId: null,
	isTapQuantized: true,
	impulseSelection: { trackId: null, impulseIds: [] },
	collapsedTrackIds: [],
	isTriggersCollapsed: false
})

// ---- Compiled view for the frame loop ----------------------

const compiledTracks = $derived(sources.tracks.map((track) => compileTrack(track)))

// Band curves only rebuild when their own settings or the
// spectrum change, so dragging one band leaves the rest alone.
let bandCacheSpectrum: SpectrumT | null = null
const bandCache = new Map<string, CompiledBandT>()

const getBandCacheKey = (band: BandSourceT): string => {
	return [band.id, band.name, band.lowHz, band.highHz, band.output, band.release, band.sensitivity].join('|')
}

const compileBandCached = (band: BandSourceT, spectrum: SpectrumT): CompiledBandT => {
	const key = getBandCacheKey(band)
	const cached = bandCache.get(key)
	if (cached !== undefined) return cached
	const compiled = compileBand(band, spectrum)
	bandCache.set(key, compiled)
	return compiled
}

const compiledBands = $derived.by(() => {
	const spectrum = getDetectedAnalysis().spectrum
	const hasNewSpectrum = spectrum !== bandCacheSpectrum
	if (hasNewSpectrum) bandCache.clear()
	bandCacheSpectrum = spectrum
	const compiled = sources.bands.map((band) => compileBandCached(band, spectrum))
	const liveKeys = new Set(sources.bands.map(getBandCacheKey))
	for (const key of bandCache.keys()) {
		const isStale = !liveKeys.has(key)
		if (isStale) bandCache.delete(key)
	}
	return compiled
})

const compiledSources = $derived<CompiledSourcesT>({ tracks: compiledTracks, bands: compiledBands })

export const getCompiledSources = (): CompiledSourcesT => compiledSources

const findCompiledImpulses = (role: ImpulseRoleT): ImpulseT[] | null => {
	const roleTracks = sources.tracks.filter((track) => track.role === role)
	const hasRoleTrack = roleTracks.length > 0
	if (!hasRoleTrack) return null
	const roleIds = new Set(roleTracks.map((track) => getTrackSourceId(track.id)))
	const matching = compiledTracks.filter((track) => roleIds.has(track.sourceId))
	return sortImpulsesByTime(matching.flatMap((track) => track.impulses))
}

const roleImpulses = $derived<RoleImpulsesT>({ kicks: findCompiledImpulses('kick'), snaps: findCompiledImpulses('snare') })

// Tracks that stand in for the detected kicks and snares.
export const getRoleImpulses = (): RoleImpulsesT => roleImpulses

// ---- Song switching ----------------------------------------

export const buildSongKey = (fileName: string, duration: number): string => `${fileName}|${duration.toFixed(1)}`

export const switchSong = (songKey: string): void => {
	const isSameSong = sources.songKey === songKey
	if (isSameSong) return
	sources.songKey = songKey
	sources.tracks = loadTracks(songKey)
	sources.armedTrackId = null
	clearImpulseSelection()
}

// Undo snapshots carry the song they belong to, so undoing
// after a song switch never pours old impulses into the new song.
export type TrackSnapshotT = {
	songKey: string
	tracks: ImpulseTrackT[]
	bands: BandSourceT[]
}

export const takeTrackSnapshot = (): TrackSnapshotT => ({
	songKey: sources.songKey,
	tracks: $state.snapshot(sources.tracks) as ImpulseTrackT[],
	bands: $state.snapshot(sources.bands) as BandSourceT[]
})

export const restoreTrackSnapshot = (snapshot: TrackSnapshotT): void => {
	const isOtherSong = snapshot.songKey !== sources.songKey
	if (isOtherSong) return
	sources.tracks = snapshot.tracks
	sources.bands = snapshot.bands
	clearImpulseSelection()
}

// ---- Tracks ------------------------------------------------

export const findTrack = (trackId: string): ImpulseTrackT | undefined => {
	return sources.tracks.find((track) => track.id === trackId)
}

const buildUniqueName = (baseName: string): string => {
	const names = new Set(sources.tracks.map((track) => track.name))
	const isFree = !names.has(baseName)
	if (isFree) return baseName
	const suffixes = Array.from({ length: 99 }, (_, index) => index + 2)
	const freeSuffix = suffixes.find((suffix) => !names.has(`${baseName} ${suffix}`))
	return `${baseName} ${freeSuffix ?? Date.now()}`
}

// One track per role, so a new owner takes it from the old.
const releaseRole = (role: ImpulseRoleT, keepTrackId: string): void => {
	const isRole = role !== 'none'
	if (!isRole) return
	for (const track of sources.tracks) {
		const isOther = track.id !== keepTrackId && track.role === role
		if (isOther) track.role = 'none'
	}
}

const pushTrack = (track: ImpulseTrackT): string => {
	sources.tracks.push(track)
	releaseRole(track.role, track.id)
	sources.isTriggersCollapsed = false
	return track.id
}

export const addEmptyTrack = (): string => {
	recordHistory()
	const track = buildImpulseTrack({ name: buildUniqueName('Impulses'), role: 'none', impulses: [] })
	return pushTrack(track)
}

// Starts a track from what detection found, to fix by hand.
// It takes over the role straight away, so the fixes show.
export const addTrackFromDetected = (role: 'kick' | 'snare'): string => {
	recordHistory()
	const analysis = getDetectedAnalysis()
	const isKick = role === 'kick'
	const detectedImpulses = isKick ? analysis.kicks : analysis.snaps
	const baseName = isKick ? 'Kick' : 'Snare'
	const track = buildImpulseTrack({ name: buildUniqueName(baseName), role, impulses: convertDetectedImpulses(detectedImpulses) })
	return pushTrack(track)
}

export type MidiImportGroupT = {
	group: MidiGroupT
	name: string
	role: ImpulseRoleT
}

export const addTracksFromMidi = (imports: MidiImportGroupT[], placement: MidiPlacementT): number => {
	const hasImports = imports.length > 0
	if (!hasImports) return 0
	recordHistory()
	for (const entry of imports) {
		const placed = entry.group.notes.map((note) => placeMidiNote(note, placement))
		const inSong = placed.filter((note) => note.time >= 0 && note.time <= app.duration)
		const impulses = inSong.map((note) => createImpulse(note.time, note.strength, note.length))
		const name = buildUniqueName(entry.name.trim() === '' ? 'MIDI' : entry.name.trim())
		pushTrack(buildImpulseTrack({ name, role: entry.role, impulses }))
	}
	return imports.length
}

export const removeTrack = (trackId: string): void => {
	recordHistory()
	sources.tracks = sources.tracks.filter((track) => track.id !== trackId)
	const wasArmed = sources.armedTrackId === trackId
	if (wasArmed) sources.armedTrackId = null
}

// A name commits once, as the whole name.
export const renameTrack = (trackId: string, name: string): void => {
	const track = findTrack(trackId)
	if (track === undefined) return
	recordHistory()
	track.name = name.slice(0, 40)
}

export const setTrackRole = (trackId: string, role: ImpulseRoleT): void => {
	const track = findTrack(trackId)
	if (track === undefined) return
	recordHistory()
	track.role = role
	releaseRole(role, trackId)
}

export const setTrackShape = (trackId: string, shape: ImpulseShapeT): void => {
	const track = findTrack(trackId)
	if (track === undefined) return
	recordHistory()
	track.shape = shape
}

export const setTrackDecay = (trackId: string, decay: number): void => {
	const track = findTrack(trackId)
	if (track === undefined) return
	recordHistoryCoalesced(`track:${trackId}`)
	track.decay = clamp(decay, MIN_TRACK_DECAY, MAX_TRACK_DECAY)
}

export const checkIsTrackCollapsed = (trackId: string): boolean => sources.collapsedTrackIds.includes(trackId)

export const toggleTrackCollapsed = (trackId: string): void => {
	const isCollapsed = checkIsTrackCollapsed(trackId)
	if (isCollapsed) {
		sources.collapsedTrackIds = sources.collapsedTrackIds.filter((candidate) => candidate !== trackId)
		return
	}
	sources.collapsedTrackIds = [...sources.collapsedTrackIds, trackId]
}

export const toggleTriggersCollapsed = (): void => {
	sources.isTriggersCollapsed = !sources.isTriggersCollapsed
}

// ---- Impulses --------------------------------------------------

const findImpulse = (track: ImpulseTrackT, impulseId: string): TrackImpulseT | undefined => {
	return track.impulses.find((impulse) => impulse.id === impulseId)
}

const clampToSong = (time: number): number => clamp(time, 0, Math.max(0, app.duration))

export const addImpulse = (trackId: string, time: number, strength: number, length: number): string | null => {
	const track = findTrack(trackId)
	if (track === undefined) return null
	recordHistory()
	const impulse = createImpulse(clampToSong(time), strength, length)
	track.impulses = insertImpulse(track.impulses, impulse)
	selectImpulses(trackId, [impulse.id])
	return impulse.id
}

const MIN_IMPULSE_STRENGTH = 0.05

export const moveImpulse = (trackId: string, impulseId: string, time: number, strength: number): void => {
	const track = findTrack(trackId)
	if (track === undefined) return
	const impulse = findImpulse(track, impulseId)
	if (impulse === undefined) return
	impulse.time = clampToSong(time)
	impulse.strength = clamp(strength, MIN_IMPULSE_STRENGTH, 1)
}

export const moveImpulses = (trackId: string, moves: ImpulseMoveT[]): void => {
	for (const move of moves) moveImpulse(trackId, move.impulseId, move.time, move.strength)
}

export const deleteImpulses = (trackId: string, impulseIds: string[]): void => {
	const track = findTrack(trackId)
	const hasImpulses = impulseIds.length > 0
	if (track === undefined || !hasImpulses) return
	recordHistory()
	const doomedIds = new Set(impulseIds)
	track.impulses = track.impulses.filter((impulse) => !doomedIds.has(impulse.id))
	const remainingSelection = sources.impulseSelection.impulseIds.filter((impulseId) => !doomedIds.has(impulseId))
	sources.impulseSelection.impulseIds = remainingSelection
}

// Merges notes into a track, one undo step. Notes closer together than
// the smallest gap collapse into one impulse at the strongest strength.
// Returns how many impulses the track now has from this import.
export type PlacedImpulseT = {
	time: number
	length: number
	strength: number
}

export const addImpulsesToTrack = (trackId: string, notes: PlacedImpulseT[]): number => {
	const track = findTrack(trackId)
	const hasNotes = notes.length > 0
	if (track === undefined || !hasNotes) return 0
	recordHistory()
	const sorted = [...notes].sort((first, second) => first.time - second.time)
	const condensed: PlacedImpulseT[] = []
	for (const note of sorted) {
		const previous = condensed[condensed.length - 1]
		const isTogether = previous !== undefined && note.time - previous.time < MIN_IMPULSE_GAP
		if (!isTogether) {
			condensed.push({ ...note })
			continue
		}
		previous.strength = Math.max(previous.strength, note.strength)
		previous.length = Math.max(previous.length, note.length)
	}
	let merged = track.impulses
	for (const note of condensed) merged = insertImpulse(merged, createImpulse(note.time, note.strength, note.length))
	track.impulses = merged
	return condensed.length
}

export const deleteImpulse = (trackId: string, impulseId: string): void => deleteImpulses(trackId, [impulseId])

// ---- Impulse selection -----------------------------------------

export const clearImpulseSelection = (): void => {
	sources.impulseSelection = { trackId: null, impulseIds: [] }
}

export const selectImpulses = (trackId: string, impulseIds: string[]): void => {
	sources.impulseSelection = { trackId, impulseIds }
}

export const checkIsImpulseSelected = (trackId: string, impulseId: string): boolean => {
	const isTrack = sources.impulseSelection.trackId === trackId
	if (!isTrack) return false
	return sources.impulseSelection.impulseIds.includes(impulseId)
}

// Selection stays on one track: picking on another track
// starts over there.
export const toggleImpulseSelected = (trackId: string, impulseId: string): void => {
	const isSameTrack = sources.impulseSelection.trackId === trackId
	const currentIds = isSameTrack ? sources.impulseSelection.impulseIds : []
	const isSelected = currentIds.includes(impulseId)
	const nextIds = isSelected ? currentIds.filter((candidate) => candidate !== impulseId) : [...currentIds, impulseId]
	selectImpulses(trackId, nextIds)
}

export const addImpulsesToSelection = (trackId: string, impulseIds: string[]): void => {
	const isSameTrack = sources.impulseSelection.trackId === trackId
	const currentIds = isSameTrack ? sources.impulseSelection.impulseIds : []
	const merged = new Set([...currentIds, ...impulseIds])
	selectImpulses(trackId, Array.from(merged))
}

export const selectAllImpulses = (trackId: string): void => {
	const track = findTrack(trackId)
	if (track === undefined) return
	selectImpulses(trackId, track.impulses.map((impulse) => impulse.id))
}

export const deleteSelectedImpulses = (): void => {
	const trackId = sources.impulseSelection.trackId
	if (trackId === null) return
	deleteImpulses(trackId, sources.impulseSelection.impulseIds)
	clearImpulseSelection()
}

export const getSelectedImpulseCount = (trackId: string): number => {
	const isTrack = sources.impulseSelection.trackId === trackId
	if (!isTrack) return 0
	return sources.impulseSelection.impulseIds.length
}

export const clearTrackRange = (trackId: string, range: TimeRangeT): void => {
	const track = findTrack(trackId)
	if (track === undefined) return
	recordHistory()
	track.impulses = replaceImpulsesInRange(track.impulses, range, [])
}

export const paintTrackRange = (trackId: string, range: TimeRangeT, impulses: TrackImpulseT[]): void => {
	const track = findTrack(trackId)
	if (track === undefined) return
	recordHistory()
	track.impulses = replaceImpulsesInRange(track.impulses, range, impulses)
}

// ---- Tap recording -----------------------------------------

let hasTappedSinceArming = false

export const armTrack = (trackId: string | null): void => {
	sources.armedTrackId = trackId
	hasTappedSinceArming = false
}

export const toggleTapQuantize = (): void => {
	sources.isTapQuantized = !sources.isTapQuantized
}

// A whole take is one undo step: history is recorded on the
// first tap after arming, not on every tap.
export const recordTap = (time: number, tempo: TempoT, snap: (time: number, tempo: TempoT) => number): void => {
	const trackId = sources.armedTrackId
	if (trackId === null) return
	const track = findTrack(trackId)
	if (track === undefined) return
	if (!hasTappedSinceArming) recordHistory()
	hasTappedSinceArming = true
	const placedTime = sources.isTapQuantized ? snap(time, tempo) : time
	const impulse = createImpulse(clampToSong(placedTime), DEFAULT_IMPULSE_STRENGTH, 0)
	track.impulses = insertImpulse(track.impulses, impulse)
}

// ---- Bands -------------------------------------------------

export const findBand = (bandId: string): BandSourceT | undefined => {
	return sources.bands.find((band) => band.id === bandId)
}

export const addBand = (presetValue: string): string => {
	recordHistory()
	const preset = BAND_PRESETS.find((candidate) => candidate.value === presetValue) ?? BAND_PRESETS[0]
	const band = buildBand(preset)
	sources.bands.push(band)
	return band.id
}

export const removeBand = (bandId: string): void => {
	recordHistory()
	sources.bands = sources.bands.filter((band) => band.id !== bandId)
}

export const renameBand = (bandId: string, name: string): void => {
	const band = findBand(bandId)
	if (band === undefined) return
	recordHistory()
	band.name = name.slice(0, 40)
}

export const setBandRange = (bandId: string, range: BandRangeT): void => {
	const band = findBand(bandId)
	if (band === undefined) return
	recordHistoryCoalesced(`band:${bandId}`)
	const clamped = clampBandRange(range)
	band.lowHz = clamped.lowHz
	band.highHz = clamped.highHz
}

export const setBandOutput = (bandId: string, output: BandOutputT): void => {
	const band = findBand(bandId)
	if (band === undefined) return
	recordHistoryCoalesced(`band:${bandId}`)
	band.output = output
}

export const setBandRelease = (bandId: string, release: number): void => {
	const band = findBand(bandId)
	if (band === undefined) return
	recordHistoryCoalesced(`band:${bandId}`)
	band.release = clamp(release, MIN_BAND_RELEASE, MAX_BAND_RELEASE)
}

export const setBandSensitivity = (bandId: string, sensitivity: number): void => {
	const band = findBand(bandId)
	if (band === undefined) return
	recordHistoryCoalesced(`band:${bandId}`)
	band.sensitivity = clamp(sensitivity, 0, 1)
}

export const applyBandPreset = (bandId: string, presetValue: string): void => {
	const band = findBand(bandId)
	const preset = BAND_PRESETS.find((candidate) => candidate.value === presetValue)
	if (band === undefined || preset === undefined) return
	recordHistory()
	band.name = preset.label
	band.lowHz = preset.lowHz
	band.highHz = preset.highHz
	band.output = preset.output
}

// ---- Persistence -------------------------------------------

export const startSourceWatchers = (): void => {
	$effect.root(() => {
		$effect(() => {
			const snapshot = $state.snapshot(sources.tracks) as ImpulseTrackT[]
			saveTracks(sources.songKey, snapshot)
		})

		$effect(() => {
			writeStored(BANDS_KEY, $state.snapshot(sources.bands))
		})
	})
}
