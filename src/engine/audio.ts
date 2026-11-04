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

export const startPlayback = (
	buffer: AudioBuffer,
	offset: number,
	tap: MediaStreamAudioDestinationNode | null,
	onEnded: () => void
): void => {
	detachSource()
	const context = getAudioContext()
	void context.resume()

	const source = context.createBufferSource()
	source.buffer = buffer
	source.connect(context.destination)
	if (tap !== null) source.connect(tap)
	source.onended = () => {
		const isCurrent = currentSource === source
		if (isCurrent) onEnded()
	}

	currentSource = source
	offsetAtStart = offset
	startedAtContextTime = context.currentTime
	isClockRunning = true
	source.start(0, offset)
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
