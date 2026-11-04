import { LOGO_CENTER_X, LOGO_CENTER_Y } from './logoLayers'
import { clamp } from './settings'
import type { SettingsT } from './types'

type RippleT = {
	lobes: number
	amount: number
	drift: number
	phase: number
}

// Four slow, drifting low-frequency ripples. Their amounts add up
// to 28% of the radius. The phases are fixed, so the blob is the
// same on every run.
const RIPPLES: RippleT[] = [
	{ lobes: 2, amount: 0.1, drift: 0.23, phase: 0.4 },
	{ lobes: 3, amount: 0.08, drift: -0.31, phase: 2.1 },
	{ lobes: 5, amount: 0.06, drift: 0.41, phase: 4.0 },
	{ lobes: 7, amount: 0.04, drift: -0.53, phase: 5.5 }
]

const OUTLINE_POINTS = 120
const BASS_WOBBLE = 0.03
const GROWTH_POWER = 1.1
const BOOST_SECONDS = 3
const BOOST_AMOUNT = 0.5
// Farthest frame corner from the logo, divided by the thinnest
// the edge can get, rounded up.
const FULL_RADIUS = 1400

export type InkPhaseT = {
	kind: 'off' | 'waiting' | 'spreading' | 'done'
	radius: number
}

export const getInkPhase = (time: number, settings: SettingsT, finishTime: number): InkPhaseT => {
	if (!settings.isInkOn) return { kind: 'off', radius: 0 }
	if (time < settings.inkStart) return { kind: 'waiting', radius: 0 }
	if (time >= finishTime) return { kind: 'done', radius: 0 }

	const progress = clamp((time - settings.inkStart) / (finishTime - settings.inkStart), 0, 1)
	const boostProgress = clamp((time - (finishTime - BOOST_SECONDS)) / BOOST_SECONDS, 0, 1)
	const boost = 1 + BOOST_AMOUNT * boostProgress
	const radius = FULL_RADIUS * Math.pow(progress, GROWTH_POWER) * boost
	return { kind: 'spreading', radius }
}

const getEdgeRadius = (angle: number, radius: number, time: number, bass: number): number => {
	let wave = 0
	for (const ripple of RIPPLES) {
		const turn = ripple.lobes * angle + ripple.phase + ripple.drift * time
		wave += ripple.amount * Math.sin(turn)
	}
	const bassWave = BASS_WOBBLE * clamp(bass, 0, 1.4) * Math.sin(4 * angle + time * 3)
	return radius * (1 + wave + bassWave)
}

// A smooth closed curve through points around the center.
export const traceInkBlob = (context: CanvasRenderingContext2D, radius: number, time: number, bass: number): void => {
	const points: [number, number][] = []
	for (let step = 0; step < OUTLINE_POINTS; step++) {
		const angle = (step / OUTLINE_POINTS) * Math.PI * 2
		const edgeRadius = getEdgeRadius(angle, radius, time, bass)
		points.push([LOGO_CENTER_X + Math.cos(angle) * edgeRadius, LOGO_CENTER_Y + Math.sin(angle) * edgeRadius])
	}

	const lastPoint = points[points.length - 1]
	const firstPoint = points[0]
	context.beginPath()
	context.moveTo((lastPoint[0] + firstPoint[0]) / 2, (lastPoint[1] + firstPoint[1]) / 2)
	for (let step = 0; step < points.length; step++) {
		const current = points[step]
		const next = points[(step + 1) % points.length]
		context.quadraticCurveTo(current[0], current[1], (current[0] + next[0]) / 2, (current[1] + next[1]) / 2)
	}
	context.closePath()
}

