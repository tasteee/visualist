import {
	AddEquation,
	CanvasTexture,
	Color,
	CustomBlending,
	DoubleSide,
	DstColorFactor,
	LinearFilter,
	LinearMipmapLinearFilter,
	Mesh,
	NoColorSpace,
	NormalBlending,
	OneFactor,
	OneMinusSrcAlphaFactor,
	OneMinusSrcColorFactor,
	OrthographicCamera,
	PlaneGeometry,
	RGBAFormat,
	Scene,
	ShaderMaterial,
	UnsignedByteType,
	Vector2,
	WebGLRenderTarget
} from 'three'
import type { Material, Texture, WebGLRenderer } from 'three'
import { GPU_GLITCH_STRIPS, getSoftCopySize } from './layerRender'
import type { GpuLayerPlanT } from './layerRender'
import { VERTEX_SHADER } from './post'
import type { BlendModeT } from './types'

// Floating layers as GPU quads. Each layer's picture is uploaded
// once (the logo, which changes every frame, is uploaded per
// frame), and the quad is moved, scaled and turned in 3D by its
// matrix. Flicker, shake, glitch and color split are uniforms;
// glow and blur are soft copies blurred on the GPU at reduced
// size, like the 2D path does on the CPU.

const BLUR_TAPS = 12

// The quad: a layer-local rectangle in frame units, y up. The
// picture, its soft copies and the split copies are all sampled
// from it by position.
const LAYER_VERTEX_SHADER = `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const LAYER_FRAGMENT_SHADER = `
uniform sampler2D uSource;
uniform vec2 uSourceSize;
uniform sampler2D uBlurred;
uniform vec2 uBlurredSize;
uniform float uHasBlur;
uniform sampler2D uGlow;
uniform vec2 uGlowSize;
uniform float uGlowAlpha;
uniform vec2 uQuadSize;
uniform float uAlpha;
uniform float uSplitDistance;
uniform float uSplitAlpha;
uniform vec3 uSplitColorA;
uniform vec3 uSplitColorB;
uniform float uHasGlitch;
uniform float uStripShift[${GPU_GLITCH_STRIPS}];
varying vec2 vUv;

vec4 sampleRect(sampler2D picture, vec2 point, vec2 size) {
	vec2 uv = point / size + 0.5;
	vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
	return texture2D(picture, clamp(uv, 0.0, 1.0)) * inside.x * inside.y;
}

vec4 over(vec4 top, vec4 bottom) {
	return top + bottom * (1.0 - top.a);
}

void main() {
	vec2 point = (vUv - 0.5) * uQuadSize;
	vec4 color = vec4(0.0);

	if (uGlowAlpha > 0.0) color = sampleRect(uGlow, point, uGlowSize) * uGlowAlpha;

	if (uSplitAlpha > 0.0) {
		float leftAlpha = sampleRect(uSource, point + vec2(uSplitDistance, 0.0), uSourceSize).a * uSplitAlpha;
		color = over(vec4(uSplitColorA * leftAlpha, leftAlpha), color);
		float rightAlpha = sampleRect(uSource, point - vec2(uSplitDistance, 0.0), uSourceSize).a * uSplitAlpha;
		color = over(vec4(uSplitColorB * rightAlpha, rightAlpha), color);
	}

	vec2 mainSize = uHasBlur > 0.5 ? uBlurredSize : uSourceSize;
	vec2 mainPoint = point;
	if (uHasGlitch > 0.5) {
		float fromTop = 0.5 - mainPoint.y / mainSize.y;
		int strip = int(clamp(floor(fromTop * ${GPU_GLITCH_STRIPS}.0), 0.0, ${GPU_GLITCH_STRIPS - 1}.0));
		mainPoint.x -= uStripShift[strip] * mainSize.x;
	}
	vec4 picture = uHasBlur > 0.5 ? sampleRect(uBlurred, mainPoint, mainSize) : sampleRect(uSource, mainPoint, mainSize);
	gl_FragColor = over(picture * uAlpha, color);
}
`

// Copies the picture into the middle of a soft-copy target,
// tinted when asked. Everything is premultiplied.
const PREPARE_SHADER = `
uniform sampler2D uSource;
uniform vec2 uInner;
uniform vec3 uTint;
uniform float uHasTint;
varying vec2 vUv;
void main() {
	vec2 uv = (vUv - 0.5) / uInner + 0.5;
	vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
	vec4 color = texture2D(uSource, clamp(uv, 0.0, 1.0)) * inside.x * inside.y;
	gl_FragColor = mix(color, vec4(uTint * color.a, color.a), uHasTint);
}
`

// A Gaussian blur along one direction, standard deviation uSigma
// pixels, like CSS blur(). Taps spread over three deviations.
const BLUR_SHADER = `
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uSigma;
varying vec2 vUv;
void main() {
	float spacing = max(1.0, uSigma * 3.0 / ${BLUR_TAPS}.0);
	vec4 sum = vec4(0.0);
	float total = 0.0;
	for (int index = -${BLUR_TAPS}; index <= ${BLUR_TAPS}; index++) {
		float offset = float(index) * spacing;
		float weight = exp(-(offset * offset) / (2.0 * uSigma * uSigma));
		sum += texture2D(uSource, vUv + uTexel * offset) * weight;
		total += weight;
	}
	gl_FragColor = sum / total;
}
`

type SoftCopyT = {
	front: WebGLRenderTarget
	back: WebGLRenderTarget
}

type GpuLayerT = {
	mesh: Mesh
	material: ShaderMaterial
	texture: CanvasTexture | null
	canvas: HTMLCanvasElement | null
	glow: SoftCopyT
	blur: SoftCopyT
}

type PassKitT = {
	scene: Scene
	camera: OrthographicCamera
	quad: Mesh
	prepare: ShaderMaterial
	blur: ShaderMaterial
}

let passKit: PassKitT | null = null
const gpuLayers = new Map<string, GpuLayerT>()
const layerGeometry = new PlaneGeometry(1, 1)

const createTarget = (): WebGLRenderTarget => {
	const target = new WebGLRenderTarget(1, 1, {
		format: RGBAFormat,
		type: UnsignedByteType,
		minFilter: LinearFilter,
		magFilter: LinearFilter,
		depthBuffer: false,
		generateMipmaps: false
	})
	target.texture.colorSpace = NoColorSpace
	return target
}

const createSoftCopy = (): SoftCopyT => ({ front: createTarget(), back: createTarget() })

const getPassKit = (): PassKitT => {
	if (passKit !== null) return passKit
	const prepare = new ShaderMaterial({
		vertexShader: VERTEX_SHADER,
		fragmentShader: PREPARE_SHADER,
		uniforms: { uSource: { value: null }, uInner: { value: new Vector2(1, 1) }, uTint: { value: new Color() }, uHasTint: { value: 0 } },
		depthTest: false,
		depthWrite: false
	})
	const blur = new ShaderMaterial({
		vertexShader: VERTEX_SHADER,
		fragmentShader: BLUR_SHADER,
		uniforms: { uSource: { value: null }, uTexel: { value: new Vector2() }, uSigma: { value: 1 } },
		depthTest: false,
		depthWrite: false
	})
	const quad = new Mesh(new PlaneGeometry(2, 2), prepare)
	quad.frustumCulled = false
	const scene = new Scene()
	scene.add(quad)
	passKit = { scene, camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1), quad, prepare, blur }
	return passKit
}

const runPass = (renderer: WebGLRenderer, kit: PassKitT, material: Material, target: WebGLRenderTarget): void => {
	kit.quad.material = material
	renderer.setRenderTarget(target)
	renderer.render(kit.scene, kit.camera)
}

// Same sizes as the 2D soft copy: the picture at a fraction of
// the output size inside a margin, blurred by radius / downscale.
const renderSoftCopy = (
	renderer: WebGLRenderer,
	soft: SoftCopyT,
	picture: Texture,
	plan: GpuLayerPlanT,
	radius: number,
	tint: string | null,
	pixelScale: number
): Vector2 => {
	const size = getSoftCopySize(plan.source, radius, pixelScale)
	const hasSize = soft.front.width === size.width && soft.front.height === size.height
	if (!hasSize) {
		soft.front.setSize(size.width, size.height)
		soft.back.setSize(size.width, size.height)
	}
	const kit = getPassKit()
	kit.prepare.uniforms.uSource.value = picture
	kit.prepare.uniforms.uInner.value.set(size.innerWidth / size.width, size.innerHeight / size.height)
	kit.prepare.uniforms.uHasTint.value = tint === null ? 0 : 1
	if (tint !== null) kit.prepare.uniforms.uTint.value.set(tint)
	runPass(renderer, kit, kit.prepare, soft.front)

	kit.blur.uniforms.uSigma.value = Math.max(0.01, size.smallRadius)
	kit.blur.uniforms.uSource.value = soft.front.texture
	kit.blur.uniforms.uTexel.value.set(1 / size.width, 0)
	runPass(renderer, kit, kit.blur, soft.back)
	kit.blur.uniforms.uSource.value = soft.back.texture
	kit.blur.uniforms.uTexel.value.set(0, 1 / size.height)
	runPass(renderer, kit, kit.blur, soft.front)
	return new Vector2(size.unitWidth, size.unitHeight)
}

// Floating layers have one GPU blend each. Overlay, soft light
// and difference need to read what is behind the layer, which
// fixed GPU blending cannot, so they fall back to normal.
export const applyGpuBlend = (material: Material, blend: BlendModeT): void => {
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

const createGpuLayer = (scene: Scene): GpuLayerT => {
	const material = new ShaderMaterial({
		vertexShader: LAYER_VERTEX_SHADER,
		fragmentShader: LAYER_FRAGMENT_SHADER,
		uniforms: {
			uSource: { value: null },
			uSourceSize: { value: new Vector2(1, 1) },
			uBlurred: { value: null },
			uBlurredSize: { value: new Vector2(1, 1) },
			uHasBlur: { value: 0 },
			uGlow: { value: null },
			uGlowSize: { value: new Vector2(1, 1) },
			uGlowAlpha: { value: 0 },
			uQuadSize: { value: new Vector2(1, 1) },
			uAlpha: { value: 1 },
			uSplitDistance: { value: 0 },
			uSplitAlpha: { value: 0 },
			uSplitColorA: { value: new Color() },
			uSplitColorB: { value: new Color() },
			uHasGlitch: { value: 0 },
			uStripShift: { value: new Array<number>(GPU_GLITCH_STRIPS).fill(0) }
		},
		transparent: true,
		premultipliedAlpha: true,
		depthTest: false,
		depthWrite: false,
		side: DoubleSide
	})
	const mesh = new Mesh(layerGeometry, material)
	mesh.frustumCulled = false
	scene.add(mesh)
	return { mesh, material, texture: null, canvas: null, glow: createSoftCopy(), blur: createSoftCopy() }
}

// Static pictures get mipmaps, so small or far-away text stays
// smooth. The logo changes every frame, so it skips them.
const createPictureTexture = (canvas: HTMLCanvasElement, isDynamic: boolean): CanvasTexture => {
	const texture = new CanvasTexture(canvas)
	texture.colorSpace = NoColorSpace
	texture.premultiplyAlpha = true
	texture.generateMipmaps = !isDynamic
	texture.minFilter = isDynamic ? LinearFilter : LinearMipmapLinearFilter
	texture.magFilter = LinearFilter
	return texture
}

const updatePicture = (gpuLayer: GpuLayerT, plan: GpuLayerPlanT, renderer: WebGLRenderer): CanvasTexture => {
	const canvas = plan.source.canvas
	const isNewPicture = gpuLayer.canvas !== canvas || gpuLayer.texture === null
	if (isNewPicture) {
		gpuLayer.texture?.dispose()
		gpuLayer.texture = createPictureTexture(canvas, plan.isDynamic)
		gpuLayer.texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
		gpuLayer.canvas = canvas
	}
	const texture = gpuLayer.texture as CanvasTexture
	// The logo canvas is reused and repainted, so it re-uploads.
	if (isNewPicture || plan.isDynamic) texture.needsUpdate = true
	return texture
}

const disposeSoftCopy = (soft: SoftCopyT): void => {
	soft.front.dispose()
	soft.back.dispose()
}

const disposeGpuLayer = (gpuLayer: GpuLayerT): void => {
	gpuLayer.mesh.removeFromParent()
	gpuLayer.material.dispose()
	gpuLayer.texture?.dispose()
	disposeSoftCopy(gpuLayer.glow)
	disposeSoftCopy(gpuLayer.blur)
}

export type GpuLayerPlacementT = {
	plan: GpuLayerPlanT
	z: number
	renderOrder: number
}

const placeMesh = (gpuLayer: GpuLayerT, placement: GpuLayerPlacementT, quadSize: Vector2): void => {
	const plan = placement.plan
	const mesh = gpuLayer.mesh
	mesh.position.set(plan.offsetX, -plan.offsetY, placement.z)
	// Turn, then tilt, then the on-screen rotation, so a turned
	// layer still spins around its own face.
	const toRadians = Math.PI / 180
	mesh.rotation.set(-plan.tilt * toRadians, plan.turn * toRadians, -plan.rotation * toRadians, 'YXZ')
	mesh.scale.set(quadSize.x * plan.scale, quadSize.y * plan.scale, 1)
	mesh.renderOrder = placement.renderOrder
	mesh.visible = true
}

// The quad covers the picture plus whatever its effects spill
// past the edges: glow and blur margins, split and glitch shifts.
const getQuadSize = (plan: GpuLayerPlanT, glowSize: Vector2 | null, blurSize: Vector2 | null): Vector2 => {
	const mainWidth = blurSize?.x ?? plan.source.width
	const glitchReach = plan.glitchShifts === null ? 0 : Math.max(...plan.glitchShifts.map(Math.abs)) * mainWidth
	const splitReach = plan.split?.distance ?? 0
	const halfWidth = Math.max(plan.source.width / 2 + splitReach, (glowSize?.x ?? 0) / 2, mainWidth / 2 + glitchReach)
	const halfHeight = Math.max(plan.source.height / 2, (glowSize?.y ?? 0) / 2, (blurSize?.y ?? 0) / 2)
	return new Vector2(halfWidth * 2, halfHeight * 2)
}

const drawGpuLayer = (renderer: WebGLRenderer, scene: Scene, placement: GpuLayerPlacementT, pixelScale: number): void => {
	const plan = placement.plan
	const id = plan.layer.id
	const gpuLayer = gpuLayers.get(id) ?? createGpuLayer(scene)
	gpuLayers.set(id, gpuLayer)
	if (gpuLayer.mesh.parent !== scene) scene.add(gpuLayer.mesh)

	const picture = updatePicture(gpuLayer, plan, renderer)
	const glowSize = plan.glow === null ? null : renderSoftCopy(renderer, gpuLayer.glow, picture, plan, plan.glow.radius, plan.glow.color, pixelScale)
	const blurSize = plan.blurRadius <= 0 ? null : renderSoftCopy(renderer, gpuLayer.blur, picture, plan, plan.blurRadius, null, pixelScale)
	const quadSize = getQuadSize(plan, glowSize, blurSize)

	const uniforms = gpuLayer.material.uniforms
	uniforms.uSource.value = picture
	uniforms.uSourceSize.value.set(plan.source.width, plan.source.height)
	uniforms.uHasBlur.value = blurSize === null ? 0 : 1
	uniforms.uBlurred.value = blurSize === null ? picture : gpuLayer.blur.front.texture
	if (blurSize !== null) uniforms.uBlurredSize.value.copy(blurSize)
	uniforms.uGlowAlpha.value = plan.glow?.alpha ?? 0
	uniforms.uGlow.value = glowSize === null ? picture : gpuLayer.glow.front.texture
	if (glowSize !== null) uniforms.uGlowSize.value.copy(glowSize)
	uniforms.uQuadSize.value.copy(quadSize)
	uniforms.uAlpha.value = plan.alpha
	uniforms.uSplitAlpha.value = plan.split?.alpha ?? 0
	uniforms.uSplitDistance.value = plan.split?.distance ?? 0
	if (plan.split !== null) {
		uniforms.uSplitColorA.value.set(plan.split.colorA)
		uniforms.uSplitColorB.value.set(plan.split.colorB)
	}
	uniforms.uHasGlitch.value = plan.glitchShifts === null ? 0 : 1
	if (plan.glitchShifts !== null) uniforms.uStripShift.value = plan.glitchShifts

	applyGpuBlend(gpuLayer.material, plan.layer.blend)
	placeMesh(gpuLayer, placement, quadSize)
}

// Puts every floating layer in the scene for this frame, hides
// the ones that are not floating right now, and frees the GPU
// copies of layers that were deleted.
export const updateGpuLayers = (
	renderer: WebGLRenderer,
	scene: Scene,
	placements: GpuLayerPlacementT[],
	liveLayerIds: Set<string>,
	pixelScale: number
): void => {
	for (const [id, gpuLayer] of gpuLayers) {
		gpuLayer.mesh.visible = false
		const isDeleted = !liveLayerIds.has(id)
		if (!isDeleted) continue
		disposeGpuLayer(gpuLayer)
		gpuLayers.delete(id)
	}
	for (const placement of placements) drawGpuLayer(renderer, scene, placement, pixelScale)
}
