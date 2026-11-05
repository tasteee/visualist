import { recordHistory } from './automation.svelte'
import { BAND_PRESETS, buildBand, clampBandRange } from './engine/bands'
import type { BandRangeT } from './engine/bands'
import { DEFAULT_HIT_STRENGTH, buildHitTrack, convertDetectedHits, createHit, insertHit, replaceHitsInRange } from './engine/hits'
import type { TempoT, TimeRangeT } from './engine/hits'
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
	sortHitsByTime
} from './engine/sources'
import type {
	BandOutputT,
	BandSourceT,
	CompiledBandT,
	CompiledSourcesT,
	HitRoleT,
	HitShapeT,
	HitT,
	HitTrackT,
	SpectrumT,
	TrackHitT
} from './engine/types'
import { app, getDetectedAnalysis } from './store.svelte'

type SourcesStateT = {
	tracks: HitTrackT[]
	bands: BandSourceT[]
	// Hit tracks belong to one song. This names it.
	songKey: string
	armedTrackId: string | null
	isTapQuantized: boolean
	// Selected hits, all on one track at a time.
	hitSelection: HitSelectionT
	collapsedTrackIds: string[]
	isTriggersCollapsed: boolean
}

export type HitSelectionT = {
	trackId: string | null
	hitIds: string[]
}

// Where a hit moves to, for moving several at once.
export type HitMoveT = {
	hitId: string
	time: number
	strength: number
}

export type RoleHitsT = {
	kicks: HitT[] | null
	snaps: HitT[] | null
}

const TRACKS_KEY = 'vink.hitTracks.v1'
const BANDS_KEY = 'vink.bands.v1'
export const DEMO_SONG_KEY = 'demo'

type StoredTracksT = Record<string, HitTrackT[]>

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

const checkIsTrackShape = (track: Partial<HitTrackT>): boolean => {
	const hasId = typeof track.id === 'string'
	const hasName = typeof track.name === 'string'
	const hasHits = Array.isArray(track.hits)
	return hasId && hasName && hasHits
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

const loadTracks = (songKey: string): HitTrackT[] => {
	const stored = readStoredTracks()[songKey]
	const isList = Array.isArray(stored)
	if (!isList) return []
	return stored.filter(checkIsTrackShape)
}

const saveTracks = (songKey: string, tracks: HitTrackT[]): void => {
	const stored = readStoredTracks()
	const hasTracks = tracks.length > 0
	if (hasTracks) stored[songKey] = tracks
	if (!hasTracks) delete stored[songKey]
	writeStored(TRACKS_KEY, stored)
}

const loadBands = (): BandSourceT[] => {
	const parsed = readStored(BANDS_KEY)
	const isList = Array.isArray(parsed)
	if (!isList) return []
	return (parsed as Partial<BandSourceT>[]).filter(checkIsBandShape) as BandSourceT[]
}

export const sources = $state<SourcesStateT>({
	tracks: loadTracks(DEMO_SONG_KEY),
	bands: loadBands(),
	songKey: DEMO_SONG_KEY,
	armedTrackId: null,
	isTapQuantized: true,
	hitSelection: { trackId: null, hitIds: [] },
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

const findCompiledHits = (role: HitRoleT): HitT[] | null => {
	const roleTracks = sources.tracks.filter((track) => track.role === role)
	const hasRoleTrack = roleTracks.length > 0
	if (!hasRoleTrack) return null
	const roleIds = new Set(roleTracks.map((track) => getTrackSourceId(track.id)))
	const matching = compiledTracks.filter((track) => roleIds.has(track.sourceId))
	return sortHitsByTime(matching.flatMap((track) => track.hits))
}

const roleHits = $derived<RoleHitsT>({ kicks: findCompiledHits('kick'), snaps: findCompiledHits('snare') })

// Tracks that stand in for the detected kicks and snares.
export const getRoleHits = (): RoleHitsT => roleHits

// ---- Song switching ----------------------------------------

export const buildSongKey = (fileName: string, duration: number): string => `${fileName}|${duration.toFixed(1)}`

export const switchSong = (songKey: string): void => {
	const isSameSong = sources.songKey === songKey
	if (isSameSong) return
	sources.songKey = songKey
	sources.tracks = loadTracks(songKey)
	sources.armedTrackId = null
	clearHitSelection()
}

// Undo snapshots carry the song they belong to, so undoing
// after a song switch never pours old hits into the new song.
export type TrackSnapshotT = {
	songKey: string
	tracks: HitTrackT[]
}

export const takeTrackSnapshot = (): TrackSnapshotT => ({
	songKey: sources.songKey,
	tracks: $state.snapshot(sources.tracks) as HitTrackT[]
})

export const restoreTrackSnapshot = (snapshot: TrackSnapshotT): void => {
	const isOtherSong = snapshot.songKey !== sources.songKey
	if (isOtherSong) return
	sources.tracks = snapshot.tracks
	clearHitSelection()
}

// ---- Tracks ------------------------------------------------

export const findTrack = (trackId: string): HitTrackT | undefined => {
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
const releaseRole = (role: HitRoleT, keepTrackId: string): void => {
	const isRole = role !== 'none'
	if (!isRole) return
	for (const track of sources.tracks) {
		const isOther = track.id !== keepTrackId && track.role === role
		if (isOther) track.role = 'none'
	}
}

const pushTrack = (track: HitTrackT): string => {
	sources.tracks.push(track)
	releaseRole(track.role, track.id)
	sources.isTriggersCollapsed = false
	return track.id
}

export const addEmptyTrack = (): string => {
	recordHistory()
	const track = buildHitTrack({ name: buildUniqueName('Hits'), role: 'none', hits: [] })
	return pushTrack(track)
}

// Starts a track from what detection found, to fix by hand.
// It takes over the role straight away, so the fixes show.
export const addTrackFromDetected = (role: 'kick' | 'snare'): string => {
	recordHistory()
	const analysis = getDetectedAnalysis()
	const isKick = role === 'kick'
	const detectedHits = isKick ? analysis.kicks : analysis.snaps
	const baseName = isKick ? 'Kick' : 'Snare'
	const track = buildHitTrack({ name: buildUniqueName(baseName), role, hits: convertDetectedHits(detectedHits) })
	return pushTrack(track)
}

export type MidiImportGroupT = {
	group: MidiGroupT
	name: string
	role: HitRoleT
}

export const addTracksFromMidi = (imports: MidiImportGroupT[], placement: MidiPlacementT): number => {
	const hasImports = imports.length > 0
	if (!hasImports) return 0
	recordHistory()
	for (const entry of imports) {
		const placed = entry.group.notes.map((note) => placeMidiNote(note, placement))
		const inSong = placed.filter((note) => note.time >= 0 && note.time <= app.duration)
		const hits = inSong.map((note) => createHit(note.time, note.strength, note.length))
		const name = buildUniqueName(entry.name.trim() === '' ? 'MIDI' : entry.name.trim())
		pushTrack(buildHitTrack({ name, role: entry.role, hits }))
	}
	return imports.length
}

export const removeTrack = (trackId: string): void => {
	recordHistory()
	sources.tracks = sources.tracks.filter((track) => track.id !== trackId)
	const wasArmed = sources.armedTrackId === trackId
	if (wasArmed) sources.armedTrackId = null
}

// Typing a name is not an undo step, like the other text fields.
export const renameTrack = (trackId: string, name: string): void => {
	const track = findTrack(trackId)
	if (track === undefined) return
	track.name = name.slice(0, 40)
}

export const setTrackRole = (trackId: string, role: HitRoleT): void => {
	const track = findTrack(trackId)
	if (track === undefined) return
	recordHistory()
	track.role = role
	releaseRole(role, trackId)
}

export const setTrackShape = (trackId: string, shape: HitShapeT): void => {
	const track = findTrack(trackId)
	if (track === undefined) return
	track.shape = shape
}

export const setTrackDecay = (trackId: string, decay: number): void => {
	const track = findTrack(trackId)
	if (track === undefined) return
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

// ---- Hits --------------------------------------------------

const findHit = (track: HitTrackT, hitId: string): TrackHitT | undefined => {
	return track.hits.find((hit) => hit.id === hitId)
}

const clampToSong = (time: number): number => clamp(time, 0, Math.max(0, app.duration))

export const addHit = (trackId: string, time: number, strength: number, length: number): string | null => {
	const track = findTrack(trackId)
	if (track === undefined) return null
	recordHistory()
	const hit = createHit(clampToSong(time), strength, length)
	track.hits = insertHit(track.hits, hit)
	selectHits(trackId, [hit.id])
	return hit.id
}

const MIN_HIT_STRENGTH = 0.05

export const moveHit = (trackId: string, hitId: string, time: number, strength: number): void => {
	const track = findTrack(trackId)
	if (track === undefined) return
	const hit = findHit(track, hitId)
	if (hit === undefined) return
	hit.time = clampToSong(time)
	hit.strength = clamp(strength, MIN_HIT_STRENGTH, 1)
}

export const moveHits = (trackId: string, moves: HitMoveT[]): void => {
	for (const move of moves) moveHit(trackId, move.hitId, move.time, move.strength)
}

export const deleteHits = (trackId: string, hitIds: string[]): void => {
	const track = findTrack(trackId)
	const hasHits = hitIds.length > 0
	if (track === undefined || !hasHits) return
	recordHistory()
	const doomedIds = new Set(hitIds)
	track.hits = track.hits.filter((hit) => !doomedIds.has(hit.id))
	const remainingSelection = sources.hitSelection.hitIds.filter((hitId) => !doomedIds.has(hitId))
	sources.hitSelection.hitIds = remainingSelection
}

export const deleteHit = (trackId: string, hitId: string): void => deleteHits(trackId, [hitId])

// ---- Hit selection -----------------------------------------

export const clearHitSelection = (): void => {
	sources.hitSelection = { trackId: null, hitIds: [] }
}

export const selectHits = (trackId: string, hitIds: string[]): void => {
	sources.hitSelection = { trackId, hitIds }
}

export const checkIsHitSelected = (trackId: string, hitId: string): boolean => {
	const isTrack = sources.hitSelection.trackId === trackId
	if (!isTrack) return false
	return sources.hitSelection.hitIds.includes(hitId)
}

// Selection stays on one track: picking on another track
// starts over there.
export const toggleHitSelected = (trackId: string, hitId: string): void => {
	const isSameTrack = sources.hitSelection.trackId === trackId
	const currentIds = isSameTrack ? sources.hitSelection.hitIds : []
	const isSelected = currentIds.includes(hitId)
	const nextIds = isSelected ? currentIds.filter((candidate) => candidate !== hitId) : [...currentIds, hitId]
	selectHits(trackId, nextIds)
}

export const addHitsToSelection = (trackId: string, hitIds: string[]): void => {
	const isSameTrack = sources.hitSelection.trackId === trackId
	const currentIds = isSameTrack ? sources.hitSelection.hitIds : []
	const merged = new Set([...currentIds, ...hitIds])
	selectHits(trackId, Array.from(merged))
}

export const selectAllHits = (trackId: string): void => {
	const track = findTrack(trackId)
	if (track === undefined) return
	selectHits(trackId, track.hits.map((hit) => hit.id))
}

export const deleteSelectedHits = (): void => {
	const trackId = sources.hitSelection.trackId
	if (trackId === null) return
	deleteHits(trackId, sources.hitSelection.hitIds)
	clearHitSelection()
}

export const getSelectedHitCount = (trackId: string): number => {
	const isTrack = sources.hitSelection.trackId === trackId
	if (!isTrack) return 0
	return sources.hitSelection.hitIds.length
}

export const clearTrackRange = (trackId: string, range: TimeRangeT): void => {
	const track = findTrack(trackId)
	if (track === undefined) return
	recordHistory()
	track.hits = replaceHitsInRange(track.hits, range, [])
}

export const paintTrackRange = (trackId: string, range: TimeRangeT, hits: TrackHitT[]): void => {
	const track = findTrack(trackId)
	if (track === undefined) return
	recordHistory()
	track.hits = replaceHitsInRange(track.hits, range, hits)
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
	const hit = createHit(clampToSong(placedTime), DEFAULT_HIT_STRENGTH, 0)
	track.hits = insertHit(track.hits, hit)
}

// ---- Bands -------------------------------------------------

export const findBand = (bandId: string): BandSourceT | undefined => {
	return sources.bands.find((band) => band.id === bandId)
}

export const addBand = (presetValue: string): string => {
	const preset = BAND_PRESETS.find((candidate) => candidate.value === presetValue) ?? BAND_PRESETS[0]
	const band = buildBand(preset)
	sources.bands.push(band)
	return band.id
}

export const removeBand = (bandId: string): void => {
	sources.bands = sources.bands.filter((band) => band.id !== bandId)
}

export const renameBand = (bandId: string, name: string): void => {
	const band = findBand(bandId)
	if (band === undefined) return
	band.name = name.slice(0, 40)
}

export const setBandRange = (bandId: string, range: BandRangeT): void => {
	const band = findBand(bandId)
	if (band === undefined) return
	const clamped = clampBandRange(range)
	band.lowHz = clamped.lowHz
	band.highHz = clamped.highHz
}

export const setBandOutput = (bandId: string, output: BandOutputT): void => {
	const band = findBand(bandId)
	if (band === undefined) return
	band.output = output
}

export const setBandRelease = (bandId: string, release: number): void => {
	const band = findBand(bandId)
	if (band === undefined) return
	band.release = clamp(release, MIN_BAND_RELEASE, MAX_BAND_RELEASE)
}

export const setBandSensitivity = (bandId: string, sensitivity: number): void => {
	const band = findBand(bandId)
	if (band === undefined) return
	band.sensitivity = clamp(sensitivity, 0, 1)
}

export const applyBandPreset = (bandId: string, presetValue: string): void => {
	const band = findBand(bandId)
	const preset = BAND_PRESETS.find((candidate) => candidate.value === presetValue)
	if (band === undefined || preset === undefined) return
	band.name = preset.label
	band.lowHz = preset.lowHz
	band.highHz = preset.highHz
	band.output = preset.output
}

// ---- Persistence -------------------------------------------

export const startSourceWatchers = (): void => {
	$effect.root(() => {
		$effect(() => {
			const snapshot = $state.snapshot(sources.tracks) as HitTrackT[]
			saveTracks(sources.songKey, snapshot)
		})

		$effect(() => {
			writeStored(BANDS_KEY, $state.snapshot(sources.bands))
		})
	})
}
