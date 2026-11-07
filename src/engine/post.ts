import { FLICKER_RATE } from './settings'
import type { SettingsT } from './types'

// The Lens and Film effects: bloom, aberration, warp, scanlines,
// noise and vignette. They run as the last passes of the 3D stage
// (see postPasses.ts), over the whole frame, layers included.
// This file has no three.js in it, so the app can decide whether
// it needs the stage without loading it.

export type PostAmountsT = {
	bloom: number
	aberration: number
	warp: number
	scanlines: number
	noise: number
	vignette: number
	isDark: boolean
}

// A full-frame quad: three.js supplies position and uv.
export const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

// Light themes glow from saturated accents only, so a white
// background never washes out. Dark themes also glow from
// anything bright.
export const BRIGHT_SHADER = `
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

export const BLUR_SHADER = `
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

export const COMPOSITE_SHADER = `
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

// Noise changes FLICKER_RATE times a second, not every frame, so
// it reads as film grain rather than static.
export const getPostSeed = (time: number): number => {
	const flickerStep = Math.floor(time * FLICKER_RATE)
	return (flickerStep % 997) * 13.37
}

// three.js needs WebGL 2. Checked once, without loading three.
let hasWebgl: boolean | null = null

export const checkIsPostAvailable = (): boolean => {
	if (hasWebgl !== null) return hasWebgl
	const canvas = document.createElement('canvas')
	const gl = canvas.getContext('webgl2')
	hasWebgl = gl !== null
	gl?.getExtension('WEBGL_lose_context')?.loseContext()
	return hasWebgl
}
