import type { HexGlitchSettingsT } from './types'

type HexGlitchRendererT = {
	canvas: HTMLCanvasElement
	context: WebGLRenderingContext
	program: WebGLProgram
	texture: WebGLTexture
	buffer: WebGLBuffer
}

const MAX_RENDER_SIDE = 1536

const VERTEX_SOURCE = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
	vUv = aPosition * 0.5 + 0.5;
	gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

// The source uses separate capture, bloom, and composite buffers.
// This layer pass keeps its hex motion and composite behavior in
// one alpha-masked shader so it can run on clips and layers.
const FRAGMENT_SOURCE = `
precision highp float;
uniform sampler2D uSource;
uniform vec2 uResolution;
uniform vec3 uTint;
uniform float uTime;
uniform float uIntensity;
uniform float uScale;
uniform float uSpeed;
uniform float uBloom;
uniform float uVignette;
varying vec2 vUv;

float hash(vec2 position) {
	return fract(sin(dot(position, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 overlay(vec3 base, vec3 tint) {
	vec3 low = 2.0 * base * tint;
	vec3 high = 1.0 - 2.0 * (1.0 - base) * (1.0 - tint);
	return mix(low, high, step(vec3(0.5), base));
}

float vignette(vec2 coordinate) {
	vec2 position = coordinate;
	position.x = (position.x - 0.5) * (uResolution.x / uResolution.y) + 0.5;
	float horizontal = 2.0 * (position.x - 0.5);
	float vertical = 2.0 * (position.y - 0.5);
	float distanceFromCenter = sqrt(horizontal * horizontal + vertical * vertical) / 1.41421356237;
	float shade = max(0.0, 1.0 - pow(distanceFromCenter * 0.6, 3.0));
	return mix(1.0, shade, uVignette);
}

void main() {
	vec4 source = texture2D(uSource, vUv);
	if (source.a < 0.001) {
		gl_FragColor = vec4(0.0);
		return;
	}

	float time = uTime * uSpeed;
	float aspect = uResolution.x / uResolution.y;
	vec2 gridPosition = (vUv - 0.5) * vec2(aspect, 1.0) * 13.0 * uScale;
	float row = floor(gridPosition.y / 0.8660254);
	float stagger = mod(row, 2.0) * 0.5;
	float column = floor(gridPosition.x - stagger);
	vec2 cell = vec2(column, row);
	vec2 center = vec2(column + stagger + 0.5, (row + 0.5) * 0.8660254);
	vec2 local = gridPosition - center;
	float cellSeed = hash(cell);
	float hexDistance = max(abs(local.y), abs(local.x) * 0.8660254 + abs(local.y) * 0.5);
	float seam = smoothstep(0.38, 0.5, hexDistance);
	float ripple = sin(length(local) * 9.0 - time * 2.4 + cellSeed * 6.28318);
	float motion = sin(time * 1.5 + cellSeed * 9.0);
	vec2 offset = vec2(cos(cellSeed * 6.28318), sin(cellSeed * 6.28318));
	offset *= (0.006 + 0.014 * motion) * uIntensity;
	float stripe = hash(vec2(floor(vUv.y * uResolution.y / 28.0), floor(time * 7.0)));
	offset.x += step(0.92, stripe) * 0.025 * sin(time * 5.0);
	vec2 samplePoint = clamp(vUv + offset, 0.0, 1.0);
	vec2 split = (vUv - 0.5) * 0.012 * uIntensity;
	vec3 sampled = vec3(
		texture2D(uSource, clamp(samplePoint + split, 0.0, 1.0)).r,
		texture2D(uSource, samplePoint).g,
		texture2D(uSource, clamp(samplePoint - split, 0.0, 1.0)).b
	);
	float pattern = 0.5 + 0.5 * ripple;
	vec3 tinted = mix(uTint * 0.22, uTint, pattern);
	vec3 color = mix(sampled, overlay(sampled, tinted), 0.35);
	color += tinted * (0.16 + 0.18 * motion) * (1.0 - seam);
	color *= 1.0 - seam * 0.22;

	vec2 texel = 1.0 / uResolution;
	vec3 bloom = vec3(0.0);
	for (int tap = -3; tap <= 3; tap++) {
		float weight = 1.0 - abs(float(tap)) / 4.0;
		vec2 blurPoint = clamp(samplePoint + texel * vec2(float(tap) * 3.0, float(tap) * 2.0), 0.0, 1.0);
		vec3 bright = max(texture2D(uSource, blurPoint).rgb - vec3(0.2), 0.0);
		bloom += bright * weight;
	}
	color += bloom * uTint * uBloom * 0.12;
	color *= vignette(vUv);
	color = clamp(color, 0.0, 1.0);
	vec3 result = mix(source.rgb, color, uIntensity);
	gl_FragColor = vec4(result, source.a);
}
`

let renderer: HexGlitchRendererT | null = null
let isUnavailable = false
const outputCanvases = new Map<string, HTMLCanvasElement>()

const compileShader = (context: WebGLRenderingContext, kind: number, source: string): WebGLShader => {
	const shader = context.createShader(kind)
	if (shader === null) throw new Error('Could not create hex glitch shader')
	context.shaderSource(shader, source)
	context.compileShader(shader)
	const didCompile = context.getShaderParameter(shader, context.COMPILE_STATUS)
	if (!didCompile) throw new Error(context.getShaderInfoLog(shader) ?? 'Could not compile hex glitch shader')
	return shader
}

const createRenderer = (): HexGlitchRendererT => {
	const canvas = document.createElement('canvas')
	const context = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false })
	if (context === null) throw new Error('WebGL is unavailable')
	const vertex = compileShader(context, context.VERTEX_SHADER, VERTEX_SOURCE)
	const fragment = compileShader(context, context.FRAGMENT_SHADER, FRAGMENT_SOURCE)
	const program = context.createProgram()
	if (program === null) throw new Error('Could not create hex glitch program')
	context.attachShader(program, vertex)
	context.attachShader(program, fragment)
	context.linkProgram(program)
	const didLink = context.getProgramParameter(program, context.LINK_STATUS)
	if (!didLink) throw new Error(context.getProgramInfoLog(program) ?? 'Could not link hex glitch program')
	context.deleteShader(vertex)
	context.deleteShader(fragment)
	const texture = context.createTexture()
	const buffer = context.createBuffer()
	if (texture === null || buffer === null) throw new Error('Could not create hex glitch buffers')
	return { canvas, context, program, texture, buffer }
}

const getRenderer = (): HexGlitchRendererT | null => {
	if (isUnavailable) return null
	if (renderer !== null) return renderer
	try {
		renderer = createRenderer()
		return renderer
	} catch (error) {
		console.warn('visualist: hex glitch shader is unavailable', error)
		isUnavailable = true
		return null
	}
}

const getColorComponents = (hex: string): number[] => {
	const normalized = hex.replace('#', '')
	const isShort = normalized.length === 3
	const full = isShort ? normalized.split('').map((digit) => { return digit + digit }).join('') : normalized
	const red = Number.parseInt(full.slice(0, 2), 16) / 255
	const green = Number.parseInt(full.slice(2, 4), 16) / 255
	const blue = Number.parseInt(full.slice(4, 6), 16) / 255
	return [red, green, blue]
}

const setFloat = (context: WebGLRenderingContext, program: WebGLProgram, name: string, value: number): void => {
	const location = context.getUniformLocation(program, name)
	context.uniform1f(location, value)
}

const getCanvas = (key: string, width: number, height: number): HTMLCanvasElement => {
	const canvas = outputCanvases.get(key) ?? document.createElement('canvas')
	outputCanvases.set(key, canvas)
	if (canvas.width !== width) canvas.width = width
	if (canvas.height !== height) canvas.height = height
	return canvas
}

export const renderHexGlitch = (source: HTMLCanvasElement, key: string, time: number, intensity: number, settings: HexGlitchSettingsT, tint: string): HTMLCanvasElement => {
	const activeRenderer = getRenderer()
	if (activeRenderer === null || intensity <= 0) return source
	const context = activeRenderer.context
	const longestSide = Math.max(source.width, source.height)
	const scale = Math.min(1, MAX_RENDER_SIDE / longestSide)
	const width = Math.max(1, Math.round(source.width * scale))
	const height = Math.max(1, Math.round(source.height * scale))
	const input = getCanvas(`${key}:input`, width, height)
	const inputContext = input.getContext('2d')
	if (inputContext === null) return source
	inputContext.clearRect(0, 0, width, height)
	inputContext.drawImage(source, 0, 0, width, height)
	activeRenderer.canvas.width = width
	activeRenderer.canvas.height = height
	context.viewport(0, 0, width, height)
	context.useProgram(activeRenderer.program)
	context.bindBuffer(context.ARRAY_BUFFER, activeRenderer.buffer)
	context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), context.STATIC_DRAW)
	const position = context.getAttribLocation(activeRenderer.program, 'aPosition')
	context.enableVertexAttribArray(position)
	context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0)
	context.activeTexture(context.TEXTURE0)
	context.bindTexture(context.TEXTURE_2D, activeRenderer.texture)
	context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, 1)
	context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE)
	context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
	context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR)
	context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR)
	context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, context.RGBA, context.UNSIGNED_BYTE, input)
	context.uniform1i(context.getUniformLocation(activeRenderer.program, 'uSource'), 0)
	context.uniform2f(context.getUniformLocation(activeRenderer.program, 'uResolution'), width, height)
	setFloat(context, activeRenderer.program, 'uTime', time)
	setFloat(context, activeRenderer.program, 'uIntensity', intensity)
	setFloat(context, activeRenderer.program, 'uScale', settings.scale)
	setFloat(context, activeRenderer.program, 'uSpeed', settings.speed)
	setFloat(context, activeRenderer.program, 'uBloom', settings.bloom)
	setFloat(context, activeRenderer.program, 'uVignette', settings.vignette)
	const color = getColorComponents(tint)
	context.uniform3f(context.getUniformLocation(activeRenderer.program, 'uTint'), color[0], color[1], color[2])
	context.drawArrays(context.TRIANGLE_STRIP, 0, 4)
	const output = getCanvas(key, width, height)
	const outputContext = output.getContext('2d')
	if (outputContext === null) return source
	outputContext.clearRect(0, 0, width, height)
	outputContext.drawImage(activeRenderer.canvas, 0, 0)
	return output
}
