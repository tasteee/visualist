import type { FoilSettingsT } from './types'

type FoilRendererT = {
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

// The spectral fit follows the user-provided shader, credited
// there to Alan Zucconi.
const FRAGMENT_SOURCE = `
precision highp float;
uniform sampler2D uSource;
uniform vec2 uResolution;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uTime;
uniform float uIntensity;
uniform float uScale;
uniform float uSpeed;
varying vec2 vUv;

float h31(vec3 point) {
	point = fract(point * vec3(.1031, .1030, .0973));
	point += dot(point, point.yxz + 33.33);
	return fract((point.x + point.y) * point.z);
}

float vn3(vec3 point) {
	vec3 cell = floor(point);
	vec3 fraction = fract(point);
	fraction = fraction * fraction * (3.0 - 2.0 * fraction);
	return mix(
		mix(mix(h31(cell), h31(cell + vec3(1,0,0)), fraction.x), mix(h31(cell + vec3(0,1,0)), h31(cell + vec3(1,1,0)), fraction.x), fraction.y),
		mix(mix(h31(cell + vec3(0,0,1)), h31(cell + vec3(1,0,1)), fraction.x), mix(h31(cell + vec3(0,1,1)), h31(cell + vec3(1,1,1)), fraction.x), fraction.y), fraction.z
	);
}

vec3 bump3y(vec3 point, vec3 offset) {
	return clamp(1.0 - point * point - offset, 0.0, 1.0);
}

vec3 spectral(float wavelength) {
	float position = clamp((wavelength - 400.0) / 300.0, 0.0, 1.0);
	vec3 firstCurve = vec3(3.54585104, 2.93225262, 2.41593945);
	vec3 firstCenter = vec3(0.69549072, 0.49228336, 0.27699880);
	vec3 firstOffset = vec3(0.02312639, 0.15225084, 0.52607955);
	vec3 secondCurve = vec3(3.90307140, 3.21182957, 3.96587128);
	vec3 secondCenter = vec3(0.11748627, 0.86755042, 0.66077860);
	vec3 secondOffset = vec3(0.84897130, 0.88445281, 0.73949448);
	return bump3y(firstCurve * (position - firstCenter), firstOffset) + bump3y(secondCurve * (position - secondCenter), secondOffset);
}

void main() {
	vec4 source = texture2D(uSource, vUv);
	if (source.a < .001) {
		gl_FragColor = vec4(0.0);
		return;
	}

	vec2 point = (vUv - .5) * vec2(uResolution.x / uResolution.y, 1.0);
	float time = uTime * uSpeed;
	vec2 light = (.55 + .15 * sin(time * .23)) * vec2(cos(time * .4), sin(time * .4));
	vec3 lightDirection = normalize(vec3(light, -1.0));
	vec3 viewDirection = normalize(vec3(0.0, 0.0, -1.6) - vec3(point, 0.0));
	float ripple = sin(length(point - vec2(.15, -.05)) * 26.0 * uScale - time * 1.2) * .5 + .5;
	vec2 facetId = floor(point * 13.0 * uScale);
	float facet = h31(vec3(facetId, 7.3));
	float angle = 6.2831 * (.12 * facet + .88 * vn3(vec3(point * 1.4 * uScale, time * .04))) + .9 * ripple;
	vec3 groove = vec3(cos(angle), sin(angle), 0.0);
	vec3 diffraction = vec3(0.0);
	for (int sampleIndex = 0; sampleIndex < 5; sampleIndex++) {
		float sampleNumber = float(sampleIndex);
		vec2 jitter = vec2(cos(sampleNumber * 2.39996), sin(sampleNumber * 2.39996)) * sqrt((sampleNumber + .5) / 5.0) * .10;
		vec3 sampledLight = normalize(lightDirection + vec3(jitter, 0.0));
		float alignment = dot(sampledLight + viewDirection, groove);
		for (int order = 1; order <= 2; order++) {
			float wavelength = 1150.0 * abs(alignment) / float(order);
			if (wavelength < 380.0 || wavelength > 780.0) continue;
			vec3 rainbow = spectral(wavelength);
			vec3 palette = mix(uColorA, uColorB, clamp((wavelength - 380.0) / 400.0, 0.0, 1.0));
			vec3 colored = mix(rainbow, rainbow * palette * 1.8, .55);
			diffraction += colored * (order == 1 ? 1.0 : .6);
		}
	}
	vec3 foil = source.rgb * .25 + diffraction * .46;
	foil = foil * (1.0 + foil / 5.0) / (1.0 + foil * .55);
	vec3 result = mix(source.rgb, foil, uIntensity);
	gl_FragColor = vec4(result, source.a);
}
`

let renderer: FoilRendererT | null = null
let isUnavailable = false
const outputCanvases = new Map<string, HTMLCanvasElement>()

const compileShader = (context: WebGLRenderingContext, kind: number, source: string): WebGLShader => {
	const shader = context.createShader(kind)
	if (shader === null) throw new Error('Could not create foil shader')
	context.shaderSource(shader, source)
	context.compileShader(shader)
	const didCompile = context.getShaderParameter(shader, context.COMPILE_STATUS)
	if (!didCompile) throw new Error(context.getShaderInfoLog(shader) ?? 'Could not compile foil shader')
	return shader
}

const createRenderer = (): FoilRendererT => {
	const canvas = document.createElement('canvas')
	const context = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false })
	if (context === null) throw new Error('WebGL is unavailable')
	const vertex = compileShader(context, context.VERTEX_SHADER, VERTEX_SOURCE)
	const fragment = compileShader(context, context.FRAGMENT_SHADER, FRAGMENT_SOURCE)
	const program = context.createProgram()
	if (program === null) throw new Error('Could not create foil program')
	context.attachShader(program, vertex)
	context.attachShader(program, fragment)
	context.linkProgram(program)
	const didLink = context.getProgramParameter(program, context.LINK_STATUS)
	if (!didLink) throw new Error(context.getProgramInfoLog(program) ?? 'Could not link foil program')
	context.deleteShader(vertex)
	context.deleteShader(fragment)
	const texture = context.createTexture()
	const buffer = context.createBuffer()
	if (texture === null || buffer === null) throw new Error('Could not create foil buffers')
	return { canvas, context, program, texture, buffer }
}

const getRenderer = (): FoilRendererT | null => {
	if (isUnavailable) return null
	if (renderer !== null) return renderer
	try {
		renderer = createRenderer()
		return renderer
	} catch (error) {
		console.warn('visualist: foil shader is unavailable', error)
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

const setColor = (context: WebGLRenderingContext, program: WebGLProgram, name: string, hex: string): void => {
	const components = getColorComponents(hex)
	const location = context.getUniformLocation(program, name)
	context.uniform3f(location, components[0], components[1], components[2])
}

const getOutputCanvas = (key: string, width: number, height: number): HTMLCanvasElement => {
	const canvas = outputCanvases.get(key) ?? document.createElement('canvas')
	outputCanvases.set(key, canvas)
	if (canvas.width !== width) canvas.width = width
	if (canvas.height !== height) canvas.height = height
	return canvas
}

export const renderFoil = (source: HTMLCanvasElement, key: string, time: number, intensity: number, settings: FoilSettingsT, colorA: string, colorB: string): HTMLCanvasElement => {
	const activeRenderer = getRenderer()
	if (activeRenderer === null || intensity <= 0) return source
	const context = activeRenderer.context
	const longestSide = Math.max(source.width, source.height)
	const scale = Math.min(1, MAX_RENDER_SIDE / longestSide)
	const width = Math.max(1, Math.round(source.width * scale))
	const height = Math.max(1, Math.round(source.height * scale))
	const input = getOutputCanvas(`${key}:input`, width, height)
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
	setColor(context, activeRenderer.program, 'uColorA', colorA)
	setColor(context, activeRenderer.program, 'uColorB', colorB)
	context.drawArrays(context.TRIANGLE_STRIP, 0, 4)
	const output = getOutputCanvas(key, width, height)
	const outputContext = output.getContext('2d')
	if (outputContext === null) return source
	outputContext.clearRect(0, 0, width, height)
	outputContext.drawImage(activeRenderer.canvas, 0, 0)
	return output
}
