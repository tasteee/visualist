let audioContext: AudioContext | null = null
let currentSource: AudioBufferSourceNode | null = null
let startedAtContextTime = 0
let offsetAtStart = 0
let isClockRunning = false

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
	return offsetAtStart + elapsed
}

export const getIsClockRunning = (): boolean => isClockRunning

const detachSource = (): void => {
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
	source: AudioBufferSourceNode,
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

	currentSource = source
	offsetAtStart = offset
	startedAtContextTime = context.currentTime
	isClockRunning = true
	const hasClip = clip !== null
	if (hasClip) source.start(0, offset, clip.duration)
	if (!hasClip) source.start(0, offset)
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
