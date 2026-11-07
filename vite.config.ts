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

export default defineConfig((environment) => {
	const isBuild = environment.command === 'build'
	const base = isBuild ? getSiteBase() : '/'

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
			chunkSizeWarningLimit: 1500
		}
	}
})
