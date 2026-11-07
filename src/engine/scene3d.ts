import {
	CanvasTexture,
	ColorManagement,
	LinearFilter,
	LinearSRGBColorSpace,
	Mesh,
	MeshBasicMaterial,
	NoColorSpace,
	NormalBlending,
	PerspectiveCamera,
	PlaneGeometry,
	Scene,
	WebGLRenderer
} from 'three'
import { splitStageLayers } from './depth'
import { updateGpuLayers } from './gpuLayers'
import type { GpuLayerPlacementT } from './gpuLayers'
import { planGpuLayer } from './layerRender'
import { getFrameLayout } from './formats'
import type { FrameLayoutT } from './formats'
import type { LogoLayersT } from './logoLayers'
import { getPostAmounts } from './post'
import { renderWithPost } from './postPasses'
import { buildStackInput, drawFrameSlice } from './render'
import type { FrameInputT, SettingsT } from './types'

// The 3D stage. Layers on the frame (depth 0, not tilted or
// turned) are drawn by the regular 2D renderer onto one base
// sheet with the background, every blend mode exact. Layers that
// float off it are GPU quads (gpuLayers.ts) hanging in front, all
// seen through a perspective camera. Lens and Film run as the
// last passes. With the camera at rest and nothing floating, the
// base sheet alone is identical to the flat render.
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
	mesh: Mesh
}

type StageT = {
	renderer: WebGLRenderer
	scene: Scene
	camera: PerspectiveCamera
	sheet: SheetT
}

let stage: StageT | null = null
let isUnavailable = false

const createSheet = (renderer: WebGLRenderer, scene: Scene): SheetT => {
	const canvas = document.createElement('canvas')
	const context = canvas.getContext('2d')
	if (context === null) throw new Error('2D canvas is not available')
	const texture = new CanvasTexture(canvas)
	texture.colorSpace = NoColorSpace
	texture.premultiplyAlpha = true
	texture.generateMipmaps = false
	texture.minFilter = LinearFilter
	texture.magFilter = LinearFilter
	texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
	const material = new MeshBasicMaterial({
		map: texture,
		transparent: true,
		premultipliedAlpha: true,
		blending: NormalBlending,
		depthTest: false,
		depthWrite: false
	})
	const mesh = new Mesh(new PlaneGeometry(1, 1), material)
	mesh.renderOrder = 0
	scene.add(mesh)
	return { canvas, context, texture, mesh }
}

const createStage = (): StageT | null => {
	try {
		const canvas = document.createElement('canvas')
		const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true })
		renderer.setPixelRatio(1)
		// No sRGB encode on output: textures are not decoded either, so
		// pixels pass through untouched.
		renderer.outputColorSpace = LinearSRGBColorSpace
		const camera = new PerspectiveCamera(FIELD_OF_VIEW, 16 / 9, 1, 100_000)
		const scene = new Scene()
		return { renderer, scene, camera, sheet: createSheet(renderer, scene) }
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

// At rest the camera sits where the depth-0 plane exactly fills
// the frame. Orbit and tilt swing it around the frame center.
const getRestDistance = (frame: FrameLayoutT): number => {
	const halfAngle = (FIELD_OF_VIEW * Math.PI) / 360
	return frame.height / 2 / Math.tan(halfAngle)
}

const getDepthZ = (depth: number, frame: FrameLayoutT): number => (depth / 100) * getRestDistance(frame) * MAX_DEPTH_SHARE

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

const drawBaseSheet = (sheet: SheetT, frame: FrameLayoutT, input: FrameInputT, logoLayers: LogoLayersT, width: number, height: number): void => {
	const flatLayers = splitStageLayers(input).flat
	const hasWrongSize = sheet.canvas.width !== width || sheet.canvas.height !== height
	if (hasWrongSize) {
		sheet.canvas.width = width
		sheet.canvas.height = height
		// A resized canvas needs a fresh GPU texture.
		sheet.texture.dispose()
	}
	sheet.context.setTransform(1, 0, 0, 1, 0, 0)
	sheet.context.clearRect(0, 0, width, height)
	drawFrameSlice(sheet.context, input, logoLayers, width, height, { layers: flatLayers, withBackground: true })
	sheet.texture.needsUpdate = true
	sheet.mesh.position.set(0, 0, 0)
	sheet.mesh.scale.set(frame.width, frame.height, 1)
}

// Floating layers in back-to-front order, each just in front of
// the last so equal depths keep their stack order.
const planFloatingLayers = (input: FrameInputT, logoLayers: LogoLayersT, frame: FrameLayoutT, width: number, height: number): GpuLayerPlacementT[] => {
	const stackInput = buildStackInput(input, logoLayers)
	const floating = splitStageLayers(input).floating
	const placements: GpuLayerPlacementT[] = []
	for (const [index, entry] of floating.entries()) {
		const plan = planGpuLayer(entry.layer, stackInput, width, height)
		if (plan === null) continue
		placements.push({ plan, z: getDepthZ(entry.depth, frame), renderOrder: index + 1 })
	}
	return placements
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

	const frame = getFrameLayout(input.settings.aspectRatio)
	drawBaseSheet(target.sheet, frame, input, logoLayers, width, height)
	const placements = planFloatingLayers(input, logoLayers, frame, width, height)
	const liveLayerIds = new Set(input.layers.map((layer) => layer.id))
	updateGpuLayers(target.renderer, target.scene, placements, liveLayerIds, width / frame.width)

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
