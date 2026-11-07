let audioContext: AudioContext | null = null
let currentSource: AudioBufferSourceNode | null = null
let startedAtContextTime = 0
let offsetAtStart = 0
let isClockRunning = false

export type LoopRegionT = {
	start: number
	end: number
}

// When set, the buffer loops between these times and the clock
// wraps with it, so the playhead never leaves the region.
let activeLoop: LoopRegionT | null = null

export const setActiveLoop = (region: LoopRegionT | null): void => {
	activeLoop = region
}

const wrapIntoLoop = (rawTime: number, region: LoopRegionT): number => {
	const isInsideRegion = rawTime < region.end
	if (isInsideRegion) return rawTime
	const length = Math.max(0.001, region.end - region.start)
	const overshoot = (rawTime - region.start) % length
	return region.start + overshoot
}

export const getAudioContext = (): AudioContext => {
	if (audioContext !== null) return audioContext
	audioContext = new AudioContext()
	return audioContext
}

export const decodeAudioFile = async (file: File): Promise<AudioBuffer> => {
	const bytes = await file.arrayBuffer()
	return getAudioContext().decodeAudioData(bytes)
}

// The clock is the audio clock, so visuals never drift from the
// sound. It keeps counting after the buffer ends, which is what
// lets a recording run on into its tail.
export const getPlaybackTime = (): number => {
	if (!isClockRunning) return offsetAtStart
	const elapsed = getAudioContext().currentTime - startedAtContextTime
	const rawTime = offsetAtStart + elapsed
	if (activeLoop === null) return rawTime
	return wrapIntoLoop(rawTime, activeLoop)
}

export const getIsClockRunning = (): boolean => isClockRunning

// Extra audio layers play alongside the song. Each starts when its
// layer does, and stops when it ends.
export type ExtraTrackT = {
	buffer: AudioBuffer
	startTime: number
	endTime: number | null
	volume: number
}

let extraTracks: ExtraTrackT[] = []
let extraSources: AudioBufferSourceNode[] = []
let extraTap: MediaStreamAudioDestinationNode | null = null
let extraClip: PlaybackClipT | null = null

export const setExtraTracks = (tracks: ExtraTrackT[]): void => {
	extraTracks = tracks
}

const stopExtras = (): void => {
	for (const source of extraSources) {
		source.onended = null
		try {
			source.stop()
		} catch {
			continue
		}
	}
	extraSources = []
}

const startExtraTrack = (context: AudioContext, track: ExtraTrackT, position: number): void => {
	const naturalEnd = track.startTime + track.buffer.duration
	const trackEnd = Math.min(track.endTime ?? Number.POSITIVE_INFINITY, naturalEnd)
	const isOver = position >= trackEnd
	if (isOver) return
	const source = context.createBufferSource()
	source.buffer = track.buffer
	const gain = context.createGain()
	gain.gain.value = track.volume
	source.connect(gain)
	gain.connect(context.destination)
	if (extraTap !== null) connectTapWithFades(context, gain, extraTap, extraClip)
	const delay = Math.max(0, track.startTime - position)
	const bufferOffset = Math.max(0, position - track.startTime)
	const playLength = trackEnd - Math.max(track.startTime, position)
	source.start(context.currentTime + delay, bufferOffset, playLength)
	extraSources.push(source)
}

// Starts every extra track as if the song were at this time.
export const startExtras = (position: number): void => {
	stopExtras()
	const context = getAudioContext()
	for (const track of extraTracks) startExtraTrack(context, track, position)
}

const detachSource = (): void => {
	stopExtras()
	const source = currentSource
	currentSource = null
	if (source === null) return
	source.onended = null
	try {
		source.stop()
	} catch {
		return
	}
}

export type PlaybackClipT = {
	duration: number
	fadeIn: number
	fadeOut: number
}

// Fades only shape the recorded tap. The speakers stay untouched.
const connectTapWithFades = (
	context: AudioContext,
	source: AudioNode,
	tap: MediaStreamAudioDestinationNode,
	clip: PlaybackClipT | null
): void => {
	const gain = context.createGain()
	source.connect(gain)
	gain.connect(tap)
	if (clip === null) return

	const now = context.currentTime
	const hasFadeIn = clip.fadeIn > 0
	const hasFadeOut = clip.fadeOut > 0
	const startLevel = hasFadeIn ? 0 : 1
	gain.gain.setValueAtTime(startLevel, now)
	if (hasFadeIn) gain.gain.linearRampToValueAtTime(1, now + clip.fadeIn)
	if (!hasFadeOut) return

	const fadeOutStart = Math.max(clip.fadeIn, clip.duration - clip.fadeOut)
	gain.gain.setValueAtTime(1, now + fadeOutStart)
	gain.gain.linearRampToValueAtTime(0, now + clip.duration)
}

export const startPlayback = (
	buffer: AudioBuffer,
	offset: number,
	tap: MediaStreamAudioDestinationNode | null,
	onEnded: () => void,
	clip: PlaybackClipT | null = null
): void => {
	detachSource()
	const context = getAudioContext()
	void context.resume()

	const source = context.createBufferSource()
	source.buffer = buffer
	source.connect(context.destination)
	if (tap !== null) connectTapWithFades(context, source, tap, clip)
	source.onended = () => {
		const isCurrent = currentSource === source
		if (isCurrent) onEnded()
	}

	const loopRegion = activeLoop
	const isLooping = loopRegion !== null && clip === null
	if (isLooping) {
		source.loop = true
		source.loopStart = loopRegion.start
		source.loopEnd = loopRegion.end
	}

	currentSource = source
	offsetAtStart = offset
	startedAtContextTime = context.currentTime
	isClockRunning = true
	extraTap = tap
	extraClip = clip
	startExtras(offset)
	const hasClip = clip !== null
	if (hasClip) activeLoop = null
	if (hasClip) source.start(0, offset, clip.duration)
	if (!hasClip) source.start(0, offset)
}

// Moves the loop under a playing source without restarting it.
// The clock is re-anchored at the current position first, so
// the playhead does not jump when the region changes.
export const retargetLoop = (region: LoopRegionT | null): void => {
	const source = currentSource
	const position = getPlaybackTime()
	offsetAtStart = position
	startedAtContextTime = getAudioContext().currentTime
	activeLoop = region
	if (source === null) return
	const isLooping = region !== null
	source.loop = isLooping
	if (region === null) return
	source.loopStart = region.start
	source.loopEnd = region.end
}

export const pausePlayback = (): number => {
	const position = getPlaybackTime()
	detachSource()
	isClockRunning = false
	offsetAtStart = position
	return position
}

export const setPausedPosition = (position: number): void => {
	detachSource()
	isClockRunning = false
	offsetAtStart = position
}

export const createRecordingTap = (): MediaStreamAudioDestinationNode => {
	return getAudioContext().createMediaStreamDestination()
}

// How far behind the clock the speakers are. Taps land late by
// this much, since people tap to what they hear.
export const getOutputLatency = (): number => {
	const context = getAudioContext()
	const outputLatency = context.outputLatency ?? 0
	const baseLatency = context.baseLatency ?? 0
	return Math.max(outputLatency, baseLatency)
}
