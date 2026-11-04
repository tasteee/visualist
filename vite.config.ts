import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'node:path'

// vink: the tasteink audio visualizer. Svelte 5 + a 2D canvas,
// with the compiled @tasteee/zest web components for all UI.
//
// The site build (root `pnpm build`) ships this app inside
// the main site at <site base>/vink/. VITE_BASE_PATH is the
// site base (e.g. /tink/ on Pages).
const getSiteBase = (): string => {
	const siteBase = process.env.VITE_BASE_PATH ?? '/'
	const hasTrailingSlash = siteBase.endsWith('/')
	if (hasTrailingSlash) return siteBase
	return `${siteBase}/`
}

export default defineConfig((environment) => {
	const isBuild = environment.command === 'build'
	const base = isBuild ? `${getSiteBase()}vink/` : '/'

	return {
		base,
		root: resolve(__dirname),
		plugins: [svelte()],
		server: {
			port: 5179,
			host: true,
			fs: { allow: [resolve(__dirname, '../..')] }
		},
		build: {
			outDir: resolve(__dirname, 'dist'),
			emptyOutDir: true,
			chunkSizeWarningLimit: 1500
		}
	}
})
