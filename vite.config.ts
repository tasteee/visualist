import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'node:path'

// visualist: the tasteink audio visualizer. Svelte 5 + a 2D canvas,
// with the compiled @tasteee/zest web components for all UI.
//
// VITE_BASE_PATH is the public base the build is served from
// (e.g. /visualist/ on GitHub Pages). Defaults to /.
const getSiteBase = (): string => {
	const siteBase = process.env.VITE_BASE_PATH ?? '/'
	const hasTrailingSlash = siteBase.endsWith('/')
	if (hasTrailingSlash) return siteBase
	return `${siteBase}/`
}

// Code that rarely changes gets its own files, so a deploy that
// only touches app code keeps them cached in returning browsers.
// three is only reached through the lazy 3D stage import, so its
// chunk still loads on demand.
const VENDOR_CHUNKS: [string, string][] = [
	['/node_modules/three/', 'three'],
	['/node_modules/@tasteee/zest/', 'zest'],
	['/node_modules/phosphor-svelte/', 'icons'],
	['/node_modules/svelte/', 'svelte'],
	['/src/assets/logo-layers/paths.json', 'logo-paths']
]

const getChunkName = (id: string): string | undefined => {
	const normalized = id.replaceAll('\\', '/')
	const match = VENDOR_CHUNKS.find(([fragment]) => normalized.includes(fragment))
	return match?.[1]
}

export default defineConfig((environment) => {
	// Preview serves dist/, so it uses the same base as the build:
	// VITE_BASE_PATH=/visualist/ pnpm preview mirrors GitHub Pages.
	const isBuildOutput = environment.command === 'build' || environment.isPreview === true
	const base = isBuildOutput ? getSiteBase() : '/'

	return {
		base,
		root: resolve(__dirname),
		plugins: [svelte()],
		server: {
			port: 5179,
			host: true
		},
		build: {
			outDir: resolve(__dirname, 'dist'),
			emptyOutDir: true,
			// Everything this app needs (WebGL 2, Web Audio, top-level
			// await-free ES modules) is newer than ES2022 anyway.
			target: 'es2022',
			chunkSizeWarningLimit: 1500,
			rollupOptions: {
				output: { manualChunks: getChunkName }
			}
		}
	}
})
