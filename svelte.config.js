import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

// Svelte can't see that z-button and friends are real
// interactive elements (they render a native button inside),
// so its a11y checks misfire on them. Only z- tags are skipped.
const ZEST_A11Y_CODES = ['a11y_no_static_element_interactions', 'a11y_click_events_have_key_events']

const checkIsZestA11yWarning = (warning) => {
	const isZestA11yCode = ZEST_A11Y_CODES.includes(warning.code)
	if (!isZestA11yCode) return false
	return warning.message.includes('<z-')
}

export default {
	preprocess: vitePreprocess(),
	compilerOptions: {
		warningFilter: (warning) => !checkIsZestA11yWarning(warning)
	}
}
