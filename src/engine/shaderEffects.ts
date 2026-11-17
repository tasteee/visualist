import type { ShaderFxKindT, ShaderFxSettingsT } from './types'

type ShaderRendererT = {
	canvas: HTMLCanvasElement
	context: WebGLRenderingContext
	program: WebGLProgram
	texture: WebGLTexture
	buffer: WebGLBuffer
}

export const SHADER_EFFECT_KINDS: ShaderFxKindT[] = [
	'tunnelwisp', 'fractalMirror', 'plasma', 'kaleidoscope',
	'liquidChrome', 'scanlines', 'prism', 'halftone',
	'ripple', 'pixelate', 'aurora', 'contour'
]

const MAX_RENDER_SIDE = 1024
const VERTEX_SOURCE = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
	vUv = aPosition * 0.5 + 0.5;
	gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

const FRAGMENT_SOURCE = `
precision highp float;
uniform sampler2D uSource;
uniform vec2 uResolution;
uniform vec3 uTint;
uniform float uTime;
uniform float uIntensity;
uniform float uScale;
uniform float uSpeed;
uniform int uMode;
varying vec2 vUv;

float hash(vec2 point) {
	return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 sampleSource(vec2 coordinate) {
	return texture2D(uSource, clamp(coordinate, 0.0, 1.0));
}

float gyroid(vec4 point, float frequency) {
	vec4 wave = sin(point * frequency);
	vec4 crossing = cos(point.zxwy * frequency);
	return abs(dot(wave, crossing) - 1.0) / frequency;
}

vec3 tunnelwisp(vec2 point, float time) {
	vec3 direction = normalize(vec3(point, 1.0));
	vec3 glow = vec3(0.0);
	float distanceAlongRay = 0.0;
	float mirrorSide = point.y + 0.1;
	for (int stepNumber = 0; stepNumber < 48; stepNumber++) {
		vec4 position = vec4(direction * distanceAlongRay, 0.2);
		position.z += time / 30.0;
		position.y = abs(position.y + 0.1);
		vec4 cave = position;
		cave.y -= 0.11;
		float twist = -2.0 * cave.z;
		mat2 rotation = mat2(cos(twist), -sin(twist), sin(twist), cos(twist));
		cave.xy = rotation * cave.xy;
		cave.y -= 0.2;
		float distanceToWall = abs(gyroid(cave, 8.0) - gyroid(cave, 24.0)) * 0.25;
		vec3 color = 1.0 + cos(vec3(1.4, 0.7, 0.0) + 5.0 * position.z);
		float reflection = mirrorSide > 0.0 ? 1.0 : 0.12;
		float attenuation = mirrorSide > 0.0 ? distanceToWall : distanceToWall * distanceToWall * distanceToWall;
		glow += reflection * color / max(attenuation, 0.0005);
		distanceAlongRay += distanceToWall + 0.0005;
	}
	float pulse = 1.4 + sin(time) * sin(time * 1.7) * sin(time * 2.3);
	glow += pulse * 800.0 * vec3(0.2, 0.8, 1.0) / max(length(point), 0.03);
	vec3 mapped = glow / 80000.0;
	return mapped / (1.0 + mapped);
}

vec3 fractalMirror(vec2 point, float time) {
	vec2 position = point * 1.4;
	for (int iteration = 0; iteration < 32; iteration++) {
		float radiusSquared = max(dot(position, position), 0.0001);
		position = abs(position) / radiusSquared - vec2(0.9 + cos(time * 0.2) * 0.4);
	}
	return 0.5 + 0.5 * sin(vec3(position.x, position.x, position.y) * 2.0);
}

void main() {
	vec4 source = sampleSource(vUv);
	if (source.a < 0.001) {
		gl_FragColor = vec4(0.0);
		return;
	}

	float time = uTime * uSpeed;
	float aspect = uResolution.x / uResolution.y;
	vec2 point = (vUv - 0.5) * vec2(aspect, 1.0) * uScale;
	vec2 coordinate = vUv;
	vec3 color = source.rgb;
	float luminance = dot(source.rgb, vec3(0.2126, 0.7152, 0.0722));

	if (uMode == 0) {
		vec3 cave = tunnelwisp(point, time);
		color = source.rgb * 0.35 + cave * mix(vec3(1.0), uTint, 0.45);
	}
	if (uMode == 1) {
		vec3 fractal = fractalMirror(point, time);
		color = source.rgb * 0.35 + fractal * uTint;
	}
	if (uMode == 2) {
		float wave = sin(point.x * 15.0 + time * 2.0 + sin(point.y * 9.0 - time));
		wave += sin(point.y * 18.0 - time * 1.4 + sin(point.x * 7.0));
		color = source.rgb * 0.4 + uTint * (0.5 + 0.25 * wave);
	}
	if (uMode == 3) {
		float angle = atan(point.y, point.x) + time * 0.15;
		float sector = 6.283185 / 8.0;
		float mirroredAngle = abs(mod(angle, sector) - sector * 0.5);
		float radius = length(point) / max(uScale, 0.1);
		coordinate = 0.5 + vec2(cos(mirroredAngle), sin(mirroredAngle)) * radius;
		color = sampleSource(coordinate).rgb;
	}
	if (uMode == 4) {
		float flow = sin(point.x * 18.0 + time * 2.0) * cos(point.y * 14.0 - time);
		coordinate += vec2(flow, sin(point.y * 20.0 + time)) * 0.015;
		vec3 warped = sampleSource(coordinate).rgb;
		float shine = pow(max(0.0, sin(flow * 5.0 + luminance * 9.0)), 7.0);
		color = warped * 0.55 + mix(vec3(0.12), uTint, shine) * (0.2 + shine);
	}
	if (uMode == 5) {
		float scan = 0.65 + 0.35 * sin(vUv.y * uResolution.y * 1.5 * uScale);
		float sweep = smoothstep(0.06, 0.0, abs(fract(vUv.y - time * 0.12) - 0.5));
		vec2 split = vec2(0.004 * uScale, 0.0);
		color = vec3(sampleSource(vUv + split).r, source.g, sampleSource(vUv - split).b);
		color = color * scan + uTint * sweep * 0.3;
	}
	if (uMode == 6) {
		vec2 tile = floor(point * 18.0);
		float shard = hash(tile);
		vec2 shift = vec2(cos(shard * 6.28), sin(shard * 6.28)) * 0.025;
		shift *= sin(time + shard * 8.0);
		color = vec3(sampleSource(vUv + shift).r, sampleSource(vUv).g, sampleSource(vUv - shift).b);
		color += uTint * pow(shard, 5.0) * 0.18;
	}
	if (uMode == 7) {
		vec2 grid = vUv * uResolution / (6.0 / max(uScale, 0.25));
		vec2 cell = fract(grid) - 0.5;
		float dots = 1.0 - smoothstep(luminance * 0.5, luminance * 0.5 + 0.12, length(cell));
		color = mix(vec3(0.04), uTint, dots);
	}
	if (uMode == 8) {
		float radius = length(point);
		float wave = sin(radius * 45.0 - time * 5.0);
		coordinate += normalize(point + 0.0001) * wave * 0.018;
		color = sampleSource(coordinate).rgb + uTint * pow(max(wave, 0.0), 8.0) * 0.18;
	}
	if (uMode == 9) {
		float blockSize = max(3.0, 18.0 / uScale + 7.0 * sin(time));
		coordinate = (floor(vUv * uResolution / blockSize) + 0.5) * blockSize / uResolution;
		color = floor(sampleSource(coordinate).rgb * 6.0) / 6.0;
		color = mix(color, color * uTint * 1.6, 0.25);
	}
	if (uMode == 10) {
		float ribbon = sin(point.x * 9.0 + time + sin(point.y * 5.0));
		float veil = exp(-18.0 * pow(point.y - ribbon * 0.18, 2.0));
		float second = exp(-20.0 * pow(point.y + ribbon * 0.2 + 0.15, 2.0));
		color = source.rgb * 0.6 + uTint * (veil * 0.65 + second * 0.4);
	}
	if (uMode == 11) {
		float field = luminance + 0.1 * sin(point.x * 12.0 + time) * cos(point.y * 10.0);
		float lines = 1.0 - smoothstep(0.025, 0.08, abs(fract(field * 12.0) - 0.5));
		color = source.rgb * 0.35 + uTint * lines;
	}

	vec3 result = mix(source.rgb, clamp(color, 0.0, 1.0), uIntensity);
	gl_FragColor = vec4(result, source.a);
}
`

let renderer: ShaderRendererT | null = null
let isUnavailable = false
const outputCanvases = new Map<string, HTMLCanvasElement>()

const compileShader = (context: WebGLRenderingContext, kind: number, source: string): WebGLShader => {
	const shader = context.createShader(kind)
	if (shader === null) throw new Error('Could not create shader effect')
	context.shaderSource(shader, source)
	context.compileShader(shader)
	const didCompile = context.getShaderParameter(shader, context.COMPILE_STATUS)
	if (!didCompile) throw new Error(context.getShaderInfoLog(shader) ?? 'Could not compile shader effect')
	return shader
}

const createRenderer = (): ShaderRendererT => {
	const canvas = document.createElement('canvas')
	const context = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false })
	if (context === null) throw new Error('WebGL is unavailable')
	const vertex = compileShader(context, context.VERTEX_SHADER, VERTEX_SOURCE)
	const fragment = compileShader(context, context.FRAGMENT_SHADER, FRAGMENT_SOURCE)
	const program = context.createProgram()
	if (program === null) throw new Error('Could not create shader effect program')
	context.attachShader(program, vertex)
	context.attachShader(program, fragment)
	context.linkProgram(program)
	const didLink = context.getProgramParameter(program, context.LINK_STATUS)
	if (!didLink) throw new Error(context.getProgramInfoLog(program) ?? 'Could not link shader effect')
	context.deleteShader(vertex)
	context.deleteShader(fragment)
	const texture = context.createTexture()
	const buffer = context.createBuffer()
	if (texture === null || buffer === null) throw new Error('Could not create shader effect buffers')
	return { canvas, context, program, texture, buffer }
}

const getRenderer = (): ShaderRendererT | null => {
	if (isUnavailable) return null
	if (renderer !== null) return renderer
	try {
		renderer = createRenderer()
		return renderer
	} catch (error) {
		console.warn('visualist: shader effects are unavailable', error)
		isUnavailable = true
		return null
	}
}

const getCanvas = (key: string, width: number, height: number): HTMLCanvasElement => {
	const canvas = outputCanvases.get(key) ?? document.createElement('canvas')
	outputCanvases.set(key, canvas)
	if (canvas.width !== width) canvas.width = width
	if (canvas.height !== height) canvas.height = height
	return canvas
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

export const renderShaderEffect = (source: HTMLCanvasElement, key: string, time: number, intensity: number, kind: ShaderFxKindT, settings: ShaderFxSettingsT, tint: string): HTMLCanvasElement => {
	const activeRenderer = getRenderer()
	if (activeRenderer === null || intensity <= 0) return source
	const context = activeRenderer.context
	const longestSide = Math.max(source.width, source.height)
	const renderScale = Math.min(1, MAX_RENDER_SIDE / longestSide)
	const width = Math.max(1, Math.round(source.width * renderScale))
	const height = Math.max(1, Math.round(source.height * renderScale))
	const input = getCanvas(`${key}:shader-input`, width, height)
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
	context.uniform1f(context.getUniformLocation(activeRenderer.program, 'uTime'), time)
	context.uniform1f(context.getUniformLocation(activeRenderer.program, 'uIntensity'), intensity)
	context.uniform1f(context.getUniformLocation(activeRenderer.program, 'uScale'), settings.scale)
	context.uniform1f(context.getUniformLocation(activeRenderer.program, 'uSpeed'), settings.speed)
	const mode = SHADER_EFFECT_KINDS.indexOf(kind)
	context.uniform1i(context.getUniformLocation(activeRenderer.program, 'uMode'), mode)
	const color = getColorComponents(tint)
	context.uniform3f(context.getUniformLocation(activeRenderer.program, 'uTint'), color[0], color[1], color[2])
	context.drawArrays(context.TRIANGLE_STRIP, 0, 4)
	const output = getCanvas(`${key}:${kind}:shader-output`, width, height)
	const outputContext = output.getContext('2d')
	if (outputContext === null) return source
	outputContext.clearRect(0, 0, width, height)
	outputContext.drawImage(activeRenderer.canvas, 0, 0)
	return output
}
