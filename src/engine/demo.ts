import { GRID_STEP, DEMO_LOOP_SECONDS } from './settings'
import { buildEmptySpectrum } from './spectrum'
import type { AnalysisT, HitT } from './types'

const DEMO_BPM = 120

// Steady 120 BPM kicks, snares on 2 and 4, and hats. Lets every
// effect be seen and tuned before a song is loaded.
export const buildDemoAnalysis = (): AnalysisT => {
	const frameCount = Math.round(DEMO_LOOP_SECONDS / GRID_STEP)
	const low = new Float32Array(frameCount)
	const mid = new Float32Array(frameCount)
	const high = new Float32Array(frameCount)
	const level = new Float32Array(frameCount)
	const energy = new Float32Array(frameCount)
	const flux = new Float32Array(frameCount)
	const kicks: HitT[] = []
	const snaps: HitT[] = []
	const beatLength = 60 / DEMO_BPM

	for (let frame = 0; frame < frameCount; frame++) {
		const time = frame * GRID_STEP
		const beatIndex = Math.floor(time / beatLength)
		const sinceBeat = time - beatIndex * beatLength
		const sinceHat = time % (beatLength / 2)
		const isSnareBeat = beatIndex % 2 === 1
		const kickShape = Math.exp(-sinceBeat / 0.12)
		const snareShape = isSnareBeat ? Math.exp(-sinceBeat / 0.1) : 0
		const hatShape = 0.45 * Math.exp(-sinceHat / 0.05)
		low[frame] = kickShape
		mid[frame] = 0.12 + snareShape
		high[frame] = 0.1 + hatShape + 0.4 * snareShape
		level[frame] = Math.min(1, 0.5 * kickShape + 0.4 * snareShape + 0.3 * hatShape + 0.15)
		const slowWave = 0.5 + 0.5 * Math.sin((2 * Math.PI * time) / 24 - 1)
		energy[frame] = Math.min(1, Math.max(0.08, slowWave * 1.1))
	}

	const beatCount = Math.floor(DEMO_LOOP_SECONDS / beatLength)
	for (let beat = 0; beat < beatCount; beat++) {
		const time = beat * beatLength
		const frame = Math.round(time / GRID_STEP)
		kicks.push({ time, strength: 1 })
		flux[frame] += 1
		const isSnareBeat = beat % 2 === 1
		if (!isSnareBeat) continue
		snaps.push({ time, strength: 0.9 })
		flux[frame] += 0.9
	}

	return {
		duration: DEMO_LOOP_SECONDS,
		low,
		mid,
		high,
		level,
		energy,
		flux,
		kicks,
		snaps,
		bpm: DEMO_BPM,
		beatOffset: 0,
		spectrum: buildEmptySpectrum(),
		isDemo: true
	}
}
