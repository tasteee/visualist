import {
	LinearFilter,
	Mesh,
	NoColorSpace,
	OrthographicCamera,
	PlaneGeometry,
	RGBAFormat,
	Scene,
	ShaderMaterial,
	UnsignedByteType,
	Vector2,
	WebGLRenderTarget
} from 'three'
import type { Camera, Texture, WebGLRenderer } from 'three'
import { BLUR_SHADER, BRIGHT_SHADER, COMPOSITE_SHADER, VERTEX_SHADER, checkHasPost, getPostSeed } from './post'
import type { PostAmountsT } from './post'

// Lens and Film as three.js passes. The stage renders into
// sceneTarget instead of the screen; bloom runs at half size
// (bright pass, then a two-step blur), and the composite pass
// writes the finished frame to the screen.

const BLOOM_SPREAD = 1.5

type PassesT = {
	scene: Scene
	camera: OrthographicCamera
	quad: Mesh
	sceneTarget: WebGLRenderTarget
	brightTarget: WebGLRenderTarget
	blurTarget: WebGLRenderTarget
	bright: ShaderMaterial
	blur: ShaderMaterial
	composite: ShaderMaterial
}

let passes: PassesT | null = null

const createTarget = (samples = 0): WebGLRenderTarget => {
	const target = new WebGLRenderTarget(1, 1, {
		format: RGBAFormat,
		type: UnsignedByteType,
		minFilter: LinearFilter,
		magFilter: LinearFilter,
		depthBuffer: false,
		generateMipmaps: false,
		samples
	})
	target.texture.colorSpace = NoColorSpace
	return target
}

const createMaterial = (fragmentShader: string, uniforms: Record<string, { value: unknown }>): ShaderMaterial =>
	new ShaderMaterial({ vertexShader: VERTEX_SHADER, fragmentShader, uniforms, depthTest: false, depthWrite: false })

const createPasses = (): PassesT => {
	const bright = createMaterial(BRIGHT_SHADER, { uScene: { value: null }, uIsDark: { value: 0 } })
	const blur = createMaterial(BLUR_SHADER, { uSource: { value: null }, uStep: { value: new Vector2() } })
	const composite = createMaterial(COMPOSITE_SHADER, {
		uScene: { value: null },
		uBloom: { value: null },
		uResolution: { value: new Vector2() },
		uTime: { value: 0 },
		uSeed: { value: 0 },
		uBloomAmount: { value: 0 },
		uAberration: { value: 0 },
		uWarp: { value: 0 },
		uScanlines: { value: 0 },
		uNoise: { value: 0 },
		uVignette: { value: 0 }
	})
	const quad = new Mesh(new PlaneGeometry(2, 2), composite)
	quad.frustumCulled = false
	const scene = new Scene()
	scene.add(quad)
	return {
		scene,
		camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
		quad,
		// Multisampled so tilted sheet edges stay smooth.
		sceneTarget: createTarget(4),
		brightTarget: createTarget(),
		blurTarget: createTarget(),
		bright,
		blur,
		composite
	}
}

const getPasses = (): PassesT => {
	passes ??= createPasses()
	return passes
}

const ensureSize = (active: PassesT, width: number, height: number): void => {
	const hasSceneSize = active.sceneTarget.width === width && active.sceneTarget.height === height
	if (!hasSceneSize) active.sceneTarget.setSize(width, height)
	const bloomWidth = Math.max(1, Math.round(width / 2))
	const bloomHeight = Math.max(1, Math.round(height / 2))
	const hasBloomSize = active.brightTarget.width === bloomWidth && active.brightTarget.height === bloomHeight
	if (hasBloomSize) return
	active.brightTarget.setSize(bloomWidth, bloomHeight)
	active.blurTarget.setSize(bloomWidth, bloomHeight)
}

const runPass = (renderer: WebGLRenderer, active: PassesT, material: ShaderMaterial, target: WebGLRenderTarget | null): void => {
	active.quad.material = material
	renderer.setRenderTarget(target)
	renderer.render(active.scene, active.camera)
}

const renderBloom = (renderer: WebGLRenderer, active: PassesT, amounts: PostAmountsT): Texture => {
	const width = active.brightTarget.width
	const height = active.brightTarget.height
	active.bright.uniforms.uScene.value = active.sceneTarget.texture
	active.bright.uniforms.uIsDark.value = amounts.isDark ? 1 : 0
	runPass(renderer, active, active.bright, active.brightTarget)

	active.blur.uniforms.uSource.value = active.brightTarget.texture
	active.blur.uniforms.uStep.value.set(BLOOM_SPREAD / width, 0)
	runPass(renderer, active, active.blur, active.blurTarget)

	active.blur.uniforms.uSource.value = active.blurTarget.texture
	active.blur.uniforms.uStep.value.set(0, BLOOM_SPREAD / height)
	runPass(renderer, active, active.blur, active.brightTarget)
	return active.brightTarget.texture
}

const renderComposite = (renderer: WebGLRenderer, active: PassesT, amounts: PostAmountsT, bloom: Texture, time: number): void => {
	const uniforms = active.composite.uniforms
	uniforms.uScene.value = active.sceneTarget.texture
	uniforms.uBloom.value = bloom
	uniforms.uResolution.value.set(active.sceneTarget.width, active.sceneTarget.height)
	uniforms.uTime.value = time
	uniforms.uSeed.value = getPostSeed(time)
	uniforms.uBloomAmount.value = amounts.bloom
	uniforms.uAberration.value = amounts.aberration
	uniforms.uWarp.value = amounts.warp
	uniforms.uScanlines.value = amounts.scanlines
	uniforms.uNoise.value = amounts.noise
	uniforms.uVignette.value = amounts.vignette
	runPass(renderer, active, active.composite, null)
}

// Renders the stage scene to the screen, through Lens and Film
// when any of them is on.
export const renderWithPost = (
	renderer: WebGLRenderer,
	stageScene: Scene,
	stageCamera: Camera,
	amounts: PostAmountsT,
	time: number
): void => {
	const hasPost = checkHasPost(amounts)
	if (!hasPost) {
		renderer.setRenderTarget(null)
		renderer.render(stageScene, stageCamera)
		return
	}
	const active = getPasses()
	const size = renderer.getDrawingBufferSize(new Vector2())
	ensureSize(active, size.x, size.y)

	renderer.setRenderTarget(active.sceneTarget)
	renderer.render(stageScene, stageCamera)

	const hasBloom = amounts.bloom > 0
	const bloom = hasBloom ? renderBloom(renderer, active, amounts) : active.sceneTarget.texture
	renderComposite(renderer, active, amounts, bloom, time)
}
