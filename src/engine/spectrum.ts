import { GRID_STEP } from './settings'
import type { SpectrumT } from './types'

// A log-spaced band spectrum on the same 10 ms grid as every
// other series. Custom frequency sources are sums of these
// bands, so any range resolves instantly without filtering
// the audio again. Hot loops index typed arrays directly,
// like the rest of the DSP code.

const FFT_SIZE = 2048
const FFT_BITS = 11
const LOWEST_HZ = 20
const HIGHEST_HZ = 16000
const BANDS_PER_OCTAVE = 6
const FRAMES_PER_CHUNK = 600
const SILENCE_POWER = 1e-12

export const SPECTRUM_LOWEST_HZ = LOWEST_HZ
export const SPECTRUM_HIGHEST_HZ = HIGHEST_HZ

type BinWeightT = {
	bin: number
	band: number
	weight: number
}

type FftTablesT = {
	reversed: Uint16Array
	cosines: Float64Array
	sines: Float64Array
	window: Float64Array
}

export type SpectrumProgressT = (fraction: number) => void

export const buildEmptySpectrum = (): SpectrumT => ({
	power: new Float32Array(0),
	frameCount: 0,
	bandCount: 0,
	edges: new Float32Array(0),
	averageDb: new Float32Array(0)
})

const getTopHz = (sampleRate: number): number => {
	const nyquist = sampleRate / 2
	return Math.min(HIGHEST_HZ, nyquist * 0.95)
}

const buildBandEdges = (sampleRate: number): Float32Array => {
	const topHz = getTopHz(sampleRate)
	const octaves = Math.log2(topHz / LOWEST_HZ)
	const bandCount = Math.max(1, Math.round(octaves * BANDS_PER_OCTAVE))
	const edges = new Float32Array(bandCount + 1)
	for (const index of edges.keys()) edges[index] = LOWEST_HZ * Math.pow(topHz / LOWEST_HZ, index / bandCount)
	return edges
}

const getOverlap = (start: number, end: number, rangeStart: number, rangeEnd: number): number => {
	const overlapStart = Math.max(start, rangeStart)
	const overlapEnd = Math.min(end, rangeEnd)
	return Math.max(0, overlapEnd - overlapStart)
}

// Each FFT bin spreads its power over the bands it overlaps,
// so narrow low bands still get a share of the wide low bins.
const buildBinWeights = (edges: Float32Array, sampleRate: number): BinWeightT[] => {
	const binWidth = sampleRate / FFT_SIZE
	const bandCount = edges.length - 1
	const weights: BinWeightT[] = []
	const binIndexes = Array.from({ length: FFT_SIZE / 2 - 1 }, (_, offset) => offset + 1)

	for (const bin of binIndexes) {
		const binStart = (bin - 0.5) * binWidth
		const binEnd = (bin + 0.5) * binWidth
		const isPastTop = binStart > edges[bandCount]
		if (isPastTop) break
		for (const band of Array.from({ length: bandCount }, (_, index) => index)) {
			const overlap = getOverlap(binStart, binEnd, edges[band], edges[band + 1])
			const hasOverlap = overlap > 0
			if (!hasOverlap) continue
			weights.push({ bin, band, weight: overlap / binWidth })
		}
	}

	return weights
}

const buildFftTables = (): FftTablesT => {
	const reversed = new Uint16Array(FFT_SIZE)
	for (const index of reversed.keys()) {
		let value = 0
		for (const bit of Array.from({ length: FFT_BITS }, (_, position) => position)) {
			const isSet = (index >> bit) & 1
			value |= isSet << (FFT_BITS - 1 - bit)
		}
		reversed[index] = value
	}

	const half = FFT_SIZE / 2
	const cosines = new Float64Array(half)
	const sines = new Float64Array(half)
	for (const index of cosines.keys()) {
		const angle = (-2 * Math.PI * index) / FFT_SIZE
		cosines[index] = Math.cos(angle)
		sines[index] = Math.sin(angle)
	}

	const window = new Float64Array(FFT_SIZE)
	for (const index of window.keys()) window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FFT_SIZE - 1))

	return { reversed, cosines, sines, window }
}

// In-place iterative radix-2 FFT.
const runFft = (real: Float64Array, imaginary: Float64Array, tables: FftTablesT): void => {
	for (let index = 0; index < FFT_SIZE; index++) {
		const target = tables.reversed[index]
		const isAhead = target > index
		if (!isAhead) continue
		const swapReal = real[index]
		real[index] = real[target]
		real[target] = swapReal
		const swapImaginary = imaginary[index]
		imaginary[index] = imaginary[target]
		imaginary[target] = swapImaginary
	}

	for (let size = 2; size <= FFT_SIZE; size *= 2) {
		const halfSize = size / 2
		const tableStep = FFT_SIZE / size
		for (let start = 0; start < FFT_SIZE; start += size) {
			for (let offset = 0; offset < halfSize; offset++) {
				const twiddleCos = tables.cosines[offset * tableStep]
				const twiddleSin = tables.sines[offset * tableStep]
				const evenIndex = start + offset
				const oddIndex = evenIndex + halfSize
				const oddReal = real[oddIndex] * twiddleCos - imaginary[oddIndex] * twiddleSin
				const oddImaginary = real[oddIndex] * twiddleSin + imaginary[oddIndex] * twiddleCos
				real[oddIndex] = real[evenIndex] - oddReal
				imaginary[oddIndex] = imaginary[evenIndex] - oddImaginary
				real[evenIndex] += oddReal
				imaginary[evenIndex] += oddImaginary
			}
		}
	}
}

const fillWindowed = (target: Float64Array, signal: Float32Array, center: number, window: Float64Array): void => {
	const start = center - FFT_SIZE / 2
	for (let index = 0; index < FFT_SIZE; index++) {
		const sampleIndex = start + index
		const isInside = sampleIndex >= 0 && sampleIndex < signal.length
		target[index] = isInside ? signal[sampleIndex] * window[index] : 0
	}
}

type FramePairT = {
	firstPower: Float64Array
	secondPower: Float64Array
}

// Two real frames ride one complex FFT, one in each part,
// then get pulled apart by conjugate symmetry.
const measureFramePair = (real: Float64Array, imaginary: Float64Array, tables: FftTablesT, output: FramePairT): void => {
	runFft(real, imaginary, tables)
	const half = FFT_SIZE / 2
	for (let bin = 1; bin < half; bin++) {
		const mirror = FFT_SIZE - bin
		const firstReal = (real[bin] + real[mirror]) / 2
		const firstImaginary = (imaginary[bin] - imaginary[mirror]) / 2
		const secondReal = (imaginary[bin] + imaginary[mirror]) / 2
		const secondImaginary = (real[mirror] - real[bin]) / 2
		output.firstPower[bin] = firstReal * firstReal + firstImaginary * firstImaginary
		output.secondPower[bin] = secondReal * secondReal + secondImaginary * secondImaginary
	}
}

const addBandPower = (power: Float32Array, frame: number, bandCount: number, binPower: Float64Array, weights: BinWeightT[]): void => {
	const rowStart = frame * bandCount
	for (const entry of weights) power[rowStart + entry.band] += binPower[entry.bin] * entry.weight
}

const buildAverageDb = (power: Float32Array, frameCount: number, bandCount: number): Float32Array => {
	const sums = new Float64Array(bandCount)
	for (let frame = 0; frame < frameCount; frame++) {
		const rowStart = frame * bandCount
		for (let band = 0; band < bandCount; band++) sums[band] += power[rowStart + band]
	}
	const averageDb = new Float32Array(bandCount)
	const safeFrameCount = Math.max(1, frameCount)
	for (const band of averageDb.keys()) averageDb[band] = 10 * Math.log10(sums[band] / safeFrameCount + SILENCE_POWER)
	return averageDb
}

const waitForPaint = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

export const buildSpectrum = async (signal: Float32Array, sampleRate: number, onProgress?: SpectrumProgressT): Promise<SpectrumT> => {
	const edges = buildBandEdges(sampleRate)
	const bandCount = edges.length - 1
	const weights = buildBinWeights(edges, sampleRate)
	const tables = buildFftTables()
	const samplesPerFrame = Math.max(1, Math.round(sampleRate * GRID_STEP))
	const frameCount = Math.ceil(signal.length / samplesPerFrame)
	const power = new Float32Array(frameCount * bandCount)

	const real = new Float64Array(FFT_SIZE)
	const imaginary = new Float64Array(FFT_SIZE)
	const pair: FramePairT = { firstPower: new Float64Array(FFT_SIZE / 2), secondPower: new Float64Array(FFT_SIZE / 2) }

	for (let frame = 0; frame < frameCount; frame += 2) {
		const firstCenter = frame * samplesPerFrame + Math.floor(samplesPerFrame / 2)
		const secondCenter = firstCenter + samplesPerFrame
		const hasSecond = frame + 1 < frameCount
		fillWindowed(real, signal, firstCenter, tables.window)
		fillWindowed(imaginary, signal, secondCenter, tables.window)
		measureFramePair(real, imaginary, tables, pair)
		addBandPower(power, frame, bandCount, pair.firstPower, weights)
		if (hasSecond) addBandPower(power, frame + 1, bandCount, pair.secondPower, weights)

		const isChunkEnd = frame % FRAMES_PER_CHUNK === 0
		if (!isChunkEnd) continue
		onProgress?.(frame / frameCount)
		await waitForPaint()
	}

	const averageDb = buildAverageDb(power, frameCount, bandCount)
	return { power, frameCount, bandCount, edges, averageDb }
}

// How much of each stored band a range covers, 0-1, on a log
// frequency axis, which is how the bands are spaced.
const getBandCoverage = (spectrum: SpectrumT, lowHz: number, highHz: number): Float32Array => {
	const coverage = new Float32Array(spectrum.bandCount)
	const logLow = Math.log2(Math.max(1, lowHz))
	const logHigh = Math.log2(Math.max(1, highHz))
	for (const band of coverage.keys()) {
		const bandLow = Math.log2(spectrum.edges[band])
		const bandHigh = Math.log2(spectrum.edges[band + 1])
		const overlap = getOverlap(bandLow, bandHigh, logLow, logHigh)
		coverage[band] = overlap / (bandHigh - bandLow)
	}
	return coverage
}

// Root of the summed band power across a frequency range,
// frame by frame. Not normalized.
export const buildRangeLevel = (spectrum: SpectrumT, lowHz: number, highHz: number): Float32Array => {
	const level = new Float32Array(spectrum.frameCount)
	const coverage = getBandCoverage(spectrum, lowHz, highHz)
	const coveredBands = Array.from(coverage.keys()).filter((band) => coverage[band] > 0)
	for (let frame = 0; frame < spectrum.frameCount; frame++) {
		const rowStart = frame * spectrum.bandCount
		let sum = 0
		for (const band of coveredBands) sum += spectrum.power[rowStart + band] * coverage[band]
		level[frame] = Math.sqrt(sum)
	}
	return level
}

export const checkHasSpectrum = (spectrum: SpectrumT): boolean => spectrum.frameCount > 0 && spectrum.bandCount > 0
