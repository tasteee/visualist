import {
	AddEquation,
	CanvasTexture,
	ColorManagement,
	CustomBlending,
	DstColorFactor,
	LinearFilter,
	LinearSRGBColorSpace,
	Mesh,
	MeshBasicMaterial,
	NoColorSpace,
	NormalBlending,
	OneFactor,
	OneMinusSrcAlphaFactor,
	OneMinusSrcColorFactor,
	PerspectiveCamera,
	PlaneGeometry,
	Scene,
	WebGLRenderer
} from 'three'
import { buildDepthSlices } from './depth'
import type { DepthSliceT } from './depth'
import { getFrameLayout } from './formats'
import type { FrameLayoutT } from './formats'
import type { LogoLayersT } from './logoLayers'
import { getPostAmounts } from './post'
import { renderWithPost } from './postPasses'
import { drawFrameSlice } from './render'
import type { BlendModeT, FrameInputT, SettingsT } from './types'

// The 3D stage. Every depth slice of the layer stack is drawn by
// the regular 2D renderer onto its own transparent sheet, and the
// sheets hang in front of a perspective camera. Lens and Film run
// as the last passes. With the camera at rest and every layer at
// depth 0, the sheets alone are identical to the flat render.
//
// Colors stay in sRGB end to end, like a 2D canvas, so the base
// sheet matches the flat render pixel for pixel.
ColorManagement.enabled = false

const FIELD_OF_VIEW = 30
// Depth 100% brings a sheet this share of the way to the camera.
const MAX_DEPTH_SHARE = 0.6

type SheetT = {
	canvas: HTMLCanvasElement
	context: CanvasRenderingContext2D
	texture: CanvasTexture
	material: MeshBasicMaterial
	mesh: Mesh
}

type StageT = {
	renderer: WebGLRenderer
	scene: Scene
	camera: PerspectiveCamera
	geometry: PlaneGeometry
	sheets: SheetT[]
}

let stage: StageT | null = null
let isUnavailable = false

const createStage = (): StageT | null => {
	try {
		const canvas = document.createElement('canvas')
		const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true })
		renderer.setPixelRatio(1)
		// No sRGB encode on output: textures are not decoded either, so
		// pixels pass through untouched.
		renderer.outputColorSpace = LinearSRGBColorSpace
		const camera = new PerspectiveCamera(FIELD_OF_VIEW, 16 / 9, 1, 100_000)
		return { renderer, scene: new Scene(), camera, geometry: new PlaneGeometry(1, 1), sheets: [] }
	} catch (error) {
		console.warn('visualist: the 3D stage is off, WebGL failed to start', error)
		return null
	}
}

const getStage = (): StageT | null => {
	if (stage !== null) return stage
	if (isUnavailable) return null
	stage = createStage()
	isUnavailable = stage === null
	return stage
}

export const checkIsStageAvailable = (): boolean => getStage() !== null

const createSheet = (target: StageT): SheetT | null => {
	const canvas = document.createElement('canvas')
	const context = canvas.getContext('2d')
	if (context === null) return null
	const texture = new CanvasTexture(canvas)
	texture.colorSpace = NoColorSpace
	texture.premultiplyAlpha = true
	texture.generateMipmaps = false
	texture.minFilter = LinearFilter
	texture.magFilter = LinearFilter
	texture.anisotropy = target.renderer.capabilities.getMaxAnisotropy()
	const material = new MeshBasicMaterial({
		map: texture,
		transparent: true,
		premultipliedAlpha: true,
		depthTest: false,
		depthWrite: false
	})
	const mesh = new Mesh(target.geometry, material)
	target.scene.add(mesh)
	return { canvas, context, texture, material, mesh }
}

const ensureSheets = (target: StageT, count: number): boolean => {
	while (target.sheets.length < count) {
		const sheet = createSheet(target)
		if (sheet === null) return false
		target.sheets.push(sheet)
	}
	return true
}

// Sheets are premultiplied. Overlay, soft light and difference
// need what is behind the sheet, which fixed GPU blending cannot
// read, so floating sheets fall back to normal for those. Inside
// a sheet, and on the base sheet, every blend mode is exact.
const applySheetBlend = (material: MeshBasicMaterial, blend: BlendModeT): void => {
	material.blendEquation = AddEquation
	if (blend === 'add') {
		material.blending = CustomBlending
		material.blendSrc = OneFactor
		material.blendDst = OneFactor
		return
	}
	if (blend === 'screen') {
		material.blending = CustomBlending
		material.blendSrc = OneFactor
		material.blendDst = OneMinusSrcColorFactor
		return
	}
	if (blend === 'multiply') {
		material.blending = CustomBlending
		material.blendSrc = DstColorFactor
		material.blendDst = OneMinusSrcAlphaFactor
		return
	}
	material.blending = NormalBlending
}

const getSliceBlend = (slice: DepthSliceT): BlendModeT => {
	if (slice.isBase) return 'normal'
	const bottomLayer = slice.layers[0]
	if (bottomLayer === undefined) return 'normal'
	return bottomLayer.blend
}

// At rest the camera sits where the depth-0 plane exactly fills
// the frame. Orbit and tilt swing it around the frame center.
const getRestDistance = (frame: FrameLayoutT): number => {
	const halfAngle = (FIELD_OF_VIEW * Math.PI) / 360
	return frame.height / 2 / Math.tan(halfAngle)
}

const placeCamera = (camera: PerspectiveCamera, frame: FrameLayoutT, settings: SettingsT): void => {
	const distance = getRestDistance(frame) * Math.max(0.05, settings.cameraDistance)
	const yaw = (settings.cameraOrbit * Math.PI) / 180
	const pitch = (settings.cameraTilt * Math.PI) / 180
	const x = distance * Math.sin(yaw) * Math.cos(pitch)
	const y = distance * Math.sin(pitch)
	const z = distance * Math.cos(yaw) * Math.cos(pitch)
	camera.aspect = frame.width / frame.height
	camera.position.set(x, y, z)
	camera.lookAt(0, 0, 0)
	camera.updateProjectionMatrix()
}

const drawSheet = (
	sheet: SheetT,
	slice: DepthSliceT,
	order: number,
	frame: FrameLayoutT,
	input: FrameInputT,
	logoLayers: LogoLayersT,
	width: number,
	height: number
): void => {
	const hasWrongSize = sheet.canvas.width !== width || sheet.canvas.height !== height
	if (hasWrongSize) {
		sheet.canvas.width = width
		sheet.canvas.height = height
		// A resized canvas needs a fresh GPU texture.
		sheet.texture.dispose()
	}
	sheet.context.setTransform(1, 0, 0, 1, 0, 0)
	sheet.context.clearRect(0, 0, width, height)
	drawFrameSlice(sheet.context, input, logoLayers, width, height, { layers: slice.layers, withBackground: slice.isBase })
	sheet.texture.needsUpdate = true

	const restDistance = getRestDistance(frame)
	sheet.mesh.position.set(0, 0, (slice.depth / 100) * restDistance * MAX_DEPTH_SHARE)
	sheet.mesh.scale.set(frame.width, frame.height, 1)
	sheet.mesh.renderOrder = order
	sheet.mesh.visible = true
	applySheetBlend(sheet.material, getSliceBlend(slice))
}

// Draws one frame through the 3D stage, Lens and Film included,
// onto the output canvas. False when WebGL is not available, so
// the caller can fall back to the flat render.
export const drawStageFrame = (
	output: CanvasRenderingContext2D,
	input: FrameInputT,
	logoLayers: LogoLayersT,
	width: number,
	height: number,
	time: number
): boolean => {
	const target = getStage()
	if (target === null) return false

	const slices = buildDepthSlices(input)
	const hasSheets = ensureSheets(target, slices.length)
	if (!hasSheets) return false

	const frame = getFrameLayout(input.settings.aspectRatio)
	slices.forEach((slice, index) => drawSheet(target.sheets[index], slice, index, frame, input, logoLayers, width, height))
	for (const sheet of target.sheets.slice(slices.length)) sheet.mesh.visible = false

	const canvas = target.renderer.domElement
	const hasWrongSize = canvas.width !== width || canvas.height !== height
	if (hasWrongSize) target.renderer.setSize(width, height, false)
	// Past the edges of the tilted frame, the background color.
	target.renderer.setClearColor(input.palette.background, 1)
	placeCamera(target.camera, frame, input.settings)
	renderWithPost(target.renderer, target.scene, target.camera, getPostAmounts(input.settings), time)

	output.save()
	output.setTransform(1, 0, 0, 1, 0, 0)
	output.globalAlpha = 1
	output.globalCompositeOperation = 'copy'
	output.drawImage(canvas, 0, 0, width, height)
	output.restore()
	return true
}
