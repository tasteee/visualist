import { FLICKER_RATE } from './settings'
import type { SettingsT } from './types'

// The finishing pass. The 2D frame is uploaded as a texture,
// run through bloom, aberration, warp, scanlines, noise and
// vignette on the GPU, and copied back onto the same canvas, so
// the recorder captures exactly what the preview shows.

export type PostAmountsT = {
	bloom: number
	aberration: number
	warp: number
	scanlines: number
	noise: number
	vignette: number
	isDark: boolean
}

type TargetT = {
	texture: WebGLTexture
	framebuffer: WebGLFramebuffer
	width: number
	height: number
}

type ProgramT = {
	program: WebGLProgram
	uniforms: Map<string, WebGLUniformLocation | null>
}

type PostRendererT = {
	gl: WebGLRenderingContext
	canvas: HTMLCanvasElement
	sceneTexture: WebGLTexture
	brightTarget: TargetT | null
	blurTarget: TargetT | null
	brightProgram: ProgramT
	blurProgram: ProgramT
	compositeProgram: ProgramT
}

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
	vUv = aPosition * 0.5 + 0.5;
	gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

// Light themes glow from saturated accents only, so a white
// background never washes out. Dark themes also glow from
// anything bright.
const BRIGHT_SHADER = `
precision mediump float;
uniform sampler2D uScene;
uniform float uIsDark;
varying vec2 vUv;
void main() {
	vec3 color = texture2D(uScene, vUv).rgb;
	float highest = max(max(color.r, color.g), color.b);
	float lowest = min(min(color.r, color.g), color.b);
	float saturation = highest <= 0.0 ? 0.0 : (highest - lowest) / highest;
	float accentWeight = smoothstep(0.3, 0.75, saturation) * smoothstep(0.25, 0.7, highest);
	float brightWeight = smoothstep(0.6, 0.95, highest) * uIsDark;
	gl_FragColor = vec4(color * max(accentWeight, brightWeight), 1.0);
}
`

const BLUR_SHADER = `
precision mediump float;
uniform sampler2D uSource;
uniform vec2 uStep;
varying vec2 vUv;
void main() {
	vec3 sum = texture2D(uSource, vUv).rgb * 0.2270;
	sum += texture2D(uSource, vUv + uStep * 1.3846).rgb * 0.3162;
	sum += texture2D(uSource, vUv - uStep * 1.3846).rgb * 0.3162;
	sum += texture2D(uSource, vUv + uStep * 3.2308).rgb * 0.0703;
	sum += texture2D(uSource, vUv - uStep * 3.2308).rgb * 0.0703;
	gl_FragColor = vec4(sum, 1.0);
}
`

const COMPOSITE_SHADER = `
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uResolution;
uniform float uTime;
uniform float uSeed;
uniform float uBloomAmount;
uniform float uAberration;
uniform float uWarp;
uniform float uScanlines;
uniform float uNoise;
uniform float uVignette;
varying vec2 vUv;

float hash(vec2 point) {
	return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
	vec2 uv = vUv;
	uv.x += sin(uv.y * 16.0 + uTime * 1.9) * 0.0045 * uWarp;
	uv.y += sin(uv.x * 11.0 - uTime * 1.4) * 0.0035 * uWarp;

	vec2 fromCenter = uv - 0.5;
	vec2 split = fromCenter * 0.014 * uAberration;
	float red = texture2D(uScene, uv + split).r;
	float green = texture2D(uScene, uv).g;
	float blue = texture2D(uScene, uv - split).b;
	vec3 color = vec3(red, green, blue);

	color += texture2D(uBloom, uv).rgb * uBloomAmount * 1.4;

	float row = sin(uv.y * uResolution.y * 1.5708);
	color *= 1.0 - uScanlines * 0.28 * (0.5 - 0.5 * row);

	float grain = hash(floor(uv * uResolution) + uSeed) - 0.5;
	color += grain * uNoise * 0.2;

	float aspect = uResolution.x / uResolution.y;
	float edgeDistance = length(fromCenter * vec2(aspect, 1.0)) / length(vec2(aspect, 1.0) * 0.5);
	float shade = 1.0 - smoothstep(0.45, 1.05, edgeDistance);
	color *= mix(1.0, shade, uVignette * 0.85);

	gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`

const UNIFORM_NAMES = [
	'uScene',
	'uBloom',
	'uSource',
	'uStep',
	'uIsDark',
	'uResolution',
	'uTime',
	'uSeed',
	'uBloomAmount',
	'uAberration',
	'uWarp',
	'uScanlines',
	'uNoise',
	'uVignette'
]

let renderer: PostRendererT | null = null
let hasFailed = false

export const getPostAmounts = (settings: SettingsT): PostAmountsT => ({
	bloom: settings.bloomAmount,
	aberration: settings.aberrationAmount,
	warp: settings.warpAmount,
	scanlines: settings.scanlineAmount,
	noise: settings.noiseAmount,
	vignette: settings.vignetteAmount,
	isDark: settings.mode === 'dark'
})

export const checkHasPost = (amounts: PostAmountsT): boolean => {
	const values = [amounts.bloom, amounts.aberration, amounts.warp, amounts.scanlines, amounts.noise, amounts.vignette]
	return values.some((value) => value > 0)
}

const compileShader = (gl: WebGLRenderingContext, type: number, source: string): WebGLShader => {
	const shader = gl.createShader(type)
	if (shader === null) throw new Error('Could not create a shader')
	gl.shaderSource(shader, source)
	gl.compileShader(shader)
	const isCompiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean
	if (!isCompiled) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader did not compile')
	return shader
}

const linkProgram = (gl: WebGLRenderingContext, fragmentSource: string): ProgramT => {
	const program = gl.createProgram()
	if (program === null) throw new Error('Could not create a program')
	gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER))
	gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource))
	gl.bindAttribLocation(program, 0, 'aPosition')
	gl.linkProgram(program)
	const isLinked = gl.getProgramParameter(program, gl.LINK_STATUS) as boolean
	if (!isLinked) throw new Error(gl.getProgramInfoLog(program) ?? 'Program did not link')
	const uniforms = new Map<string, WebGLUniformLocation | null>()
	for (const name of UNIFORM_NAMES) uniforms.set(name, gl.getUniformLocation(program, name))
	return { program, uniforms }
}

const createTexture = (gl: WebGLRenderingContext): WebGLTexture => {
	const texture = gl.createTexture()
	if (texture === null) throw new Error('Could not create a texture')
	gl.bindTexture(gl.TEXTURE_2D, texture)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
	return texture
}

const createTarget = (gl: WebGLRenderingContext, width: number, height: number): TargetT => {
	const texture = createTexture(gl)
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
	const framebuffer = gl.createFramebuffer()
	if (framebuffer === null) throw new Error('Could not create a framebuffer')
	gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
	gl.bindFramebuffer(gl.FRAMEBUFFER, null)
	return { texture, framebuffer, width, height }
}

const deleteTarget = (gl: WebGLRenderingContext, target: TargetT | null): void => {
	if (target === null) return
	gl.deleteTexture(target.texture)
	gl.deleteFramebuffer(target.framebuffer)
}

const createRenderer = (): PostRendererT => {
	const canvas = document.createElement('canvas')
	const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true })
	if (gl === null) throw new Error('WebGL is not available')

	const quad = gl.createBuffer()
	gl.bindBuffer(gl.ARRAY_BUFFER, quad)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
	gl.enableVertexAttribArray(0)
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

	return {
		gl,
		canvas,
		sceneTexture: createTexture(gl),
		brightTarget: null,
		blurTarget: null,
		brightProgram: linkProgram(gl, BRIGHT_SHADER),
		blurProgram: linkProgram(gl, BLUR_SHADER),
		compositeProgram: linkProgram(gl, COMPOSITE_SHADER)
	}
}

// One failure turns the post stack off for the session, so a
// machine without WebGL still renders and records the 2D frame.
const getRenderer = (): PostRendererT | null => {
	if (hasFailed) return null
	if (renderer !== null) return renderer
	try {
		renderer = createRenderer()
		return renderer
	} catch (error) {
		hasFailed = true
		console.warn('vink: post effects are off, WebGL failed to start', error)
		return null
	}
}

const ensureSize = (active: PostRendererT, width: number, height: number): void => {
	const gl = active.gl
	const hasCanvasSize = active.canvas.width === width && active.canvas.height === height
	if (!hasCanvasSize) {
		active.canvas.width = width
		active.canvas.height = height
	}
	const bloomWidth = Math.max(1, Math.round(width / 2))
	const bloomHeight = Math.max(1, Math.round(height / 2))
	const brightTarget = active.brightTarget
	const hasBloomSize = brightTarget !== null && brightTarget.width === bloomWidth && brightTarget.height === bloomHeight
	if (hasBloomSize) return
	deleteTarget(gl, active.brightTarget)
	deleteTarget(gl, active.blurTarget)
	active.brightTarget = createTarget(gl, bloomWidth, bloomHeight)
	active.blurTarget = createTarget(gl, bloomWidth, bloomHeight)
}

const useProgram = (gl: WebGLRenderingContext, program: ProgramT): void => gl.useProgram(program.program)

const getUniform = (program: ProgramT, name: string): WebGLUniformLocation | null => program.uniforms.get(name) ?? null

const bindTexture = (gl: WebGLRenderingContext, unit: number, texture: WebGLTexture): void => {
	gl.activeTexture(gl.TEXTURE0 + unit)
	gl.bindTexture(gl.TEXTURE_2D, texture)
}

const drawInto = (gl: WebGLRenderingContext, target: TargetT | null, width: number, height: number): void => {
	const framebuffer = target === null ? null : target.framebuffer
	gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
	gl.viewport(0, 0, width, height)
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

const renderBloom = (active: PostRendererT, amounts: PostAmountsT): void => {
	const gl = active.gl
	const brightTarget = active.brightTarget
	const blurTarget = active.blurTarget
	if (brightTarget === null || blurTarget === null) return
	const width = brightTarget.width
	const height = brightTarget.height

	useProgram(gl, active.brightProgram)
	bindTexture(gl, 0, active.sceneTexture)
	gl.uniform1i(getUniform(active.brightProgram, 'uScene'), 0)
	gl.uniform1f(getUniform(active.brightProgram, 'uIsDark'), amounts.isDark ? 1 : 0)
	drawInto(gl, brightTarget, width, height)

	const spread = 1.5
	useProgram(gl, active.blurProgram)
	gl.uniform1i(getUniform(active.blurProgram, 'uSource'), 0)
	bindTexture(gl, 0, brightTarget.texture)
	gl.uniform2f(getUniform(active.blurProgram, 'uStep'), spread / width, 0)
	drawInto(gl, blurTarget, width, height)

	bindTexture(gl, 0, blurTarget.texture)
	gl.uniform2f(getUniform(active.blurProgram, 'uStep'), 0, spread / height)
	drawInto(gl, brightTarget, width, height)
}

const renderComposite = (active: PostRendererT, amounts: PostAmountsT, time: number): void => {
	const gl = active.gl
	const program = active.compositeProgram
	const bloomTexture = active.brightTarget === null ? active.sceneTexture : active.brightTarget.texture
	const flickerStep = Math.floor(time * FLICKER_RATE)

	useProgram(gl, program)
	bindTexture(gl, 0, active.sceneTexture)
	bindTexture(gl, 1, bloomTexture)
	gl.uniform1i(getUniform(program, 'uScene'), 0)
	gl.uniform1i(getUniform(program, 'uBloom'), 1)
	gl.uniform2f(getUniform(program, 'uResolution'), active.canvas.width, active.canvas.height)
	gl.uniform1f(getUniform(program, 'uTime'), time)
	gl.uniform1f(getUniform(program, 'uSeed'), (flickerStep % 997) * 13.37)
	gl.uniform1f(getUniform(program, 'uBloomAmount'), amounts.bloom)
	gl.uniform1f(getUniform(program, 'uAberration'), amounts.aberration)
	gl.uniform1f(getUniform(program, 'uWarp'), amounts.warp)
	gl.uniform1f(getUniform(program, 'uScanlines'), amounts.scanlines)
	gl.uniform1f(getUniform(program, 'uNoise'), amounts.noise)
	gl.uniform1f(getUniform(program, 'uVignette'), amounts.vignette)
	drawInto(gl, null, active.canvas.width, active.canvas.height)
}

// Runs the stack over the canvas in place. Returns false when
// WebGL is unavailable, leaving the 2D frame as it was.
export const applyPostEffects = (context: CanvasRenderingContext2D, amounts: PostAmountsT, time: number): boolean => {
	const hasPost = checkHasPost(amounts)
	if (!hasPost) return true
	const active = getRenderer()
	if (active === null) return false

	const source = context.canvas
	ensureSize(active, source.width, source.height)
	const gl = active.gl
	bindTexture(gl, 0, active.sceneTexture)
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)

	const hasBloom = amounts.bloom > 0
	if (hasBloom) renderBloom(active, amounts)
	renderComposite(active, amounts, time)

	context.save()
	context.setTransform(1, 0, 0, 1, 0, 0)
	context.globalAlpha = 1
	context.globalCompositeOperation = 'copy'
	context.drawImage(active.canvas, 0, 0)
	context.restore()
	return true
}

export const checkIsPostAvailable = (): boolean => getRenderer() !== null
