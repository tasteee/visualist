export type RecorderFormatT = {
	mimeType: string
	extension: 'mp4' | 'webm'
	label: string
}

const VIDEO_BITS_PER_SECOND = 16_000_000
const AUDIO_BITS_PER_SECOND = 256_000

const FORMAT_CANDIDATES: RecorderFormatT[] = [
	{ mimeType: 'video/mp4;codecs=avc1.640028,mp4a.40.2', extension: 'mp4', label: 'MP4 · H.264 + AAC' },
	{ mimeType: 'video/mp4;codecs=avc1,mp4a.40.2', extension: 'mp4', label: 'MP4 · H.264 + AAC' },
	{ mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm', label: 'WebM · VP9 + Opus' },
	{ mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm', label: 'WebM · VP8 + Opus' },
	{ mimeType: 'video/webm', extension: 'webm', label: 'WebM' }
]

// MP4 when the browser can record it, otherwise WebM.
export const pickRecorderFormat = (): RecorderFormatT | null => {
	const hasRecorder = typeof MediaRecorder !== 'undefined'
	if (!hasRecorder) return null
	for (const candidate of FORMAT_CANDIDATES) {
		const isSupported = MediaRecorder.isTypeSupported(candidate.mimeType)
		if (isSupported) return candidate
	}
	return null
}

export type ActiveRecordingT = {
	finish: () => Promise<Blob>
	cancel: () => void
}

export const startRecorder = (
	canvas: HTMLCanvasElement,
	frameRate: number,
	audioStream: MediaStream,
	format: RecorderFormatT
): ActiveRecordingT => {
	const stream = canvas.captureStream(frameRate)
	for (const track of audioStream.getAudioTracks()) stream.addTrack(track)

	const recorder = new MediaRecorder(stream, {
		mimeType: format.mimeType,
		videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
		audioBitsPerSecond: AUDIO_BITS_PER_SECOND
	})

	const chunks: Blob[] = []
	let isCancelled = false
	recorder.ondataavailable = (event) => {
		const hasData = event.data.size > 0
		if (hasData && !isCancelled) chunks.push(event.data)
	}

	const stopTracks = () => {
		for (const track of stream.getTracks()) track.stop()
	}

	const finish = (): Promise<Blob> => {
		return new Promise((resolve) => {
			recorder.onstop = () => {
				stopTracks()
				const baseType = format.mimeType.split(';')[0]
				resolve(new Blob(chunks, { type: baseType }))
			}
			recorder.stop()
		})
	}

	const cancel = () => {
		isCancelled = true
		recorder.onstop = stopTracks
		const isActive = recorder.state !== 'inactive'
		if (isActive) recorder.stop()
	}

	recorder.start(1000)
	return { finish, cancel }
}
