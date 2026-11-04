import type { AnalysisT } from './types'

const FRAMES_PER_SECOND = 100

const readMax = (series: Float32Array): number => {
	let peak = 0
	for (const value of series) peak = Math.max(peak, value)
	return peak
}

// Loudest of overall level and bass between two times. At deep
// zoom a bar can be narrower than one 10 ms frame, so the range
// always covers at least one frame.
export const readPeak = (analysis: AnalysisT, startTime: number, endTime: number): number => {
	const frameCount = analysis.level.length
	const hasFrames = frameCount > 0
	if (!hasFrames) return 0
	const lastFrame = frameCount - 1
	const startFrame = Math.min(lastFrame, Math.max(0, Math.floor(startTime * FRAMES_PER_SECOND)))
	const endFrame = Math.min(frameCount, Math.max(startFrame + 1, Math.floor(endTime * FRAMES_PER_SECOND)))
	const levelPeak = readMax(analysis.level.subarray(startFrame, endFrame))
	const lowPeak = readMax(analysis.low.subarray(startFrame, endFrame))
	return Math.min(1, Math.max(levelPeak, lowPeak))
}
