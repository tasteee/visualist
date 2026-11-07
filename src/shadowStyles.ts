// Global CSS cannot reach inside a web component's shadow root, so this
// adds a stylesheet to it. Use as `use:shadowStyles={css}` on the element.
export const shadowStyles = (node: HTMLElement, css: string) => {
	const sheet = new CSSStyleSheet()
	sheet.replaceSync(css)
	let isDone = false

	const attach = () => {
		const root = node.shadowRoot
		if (root === null || isDone) return
		root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
		isDone = true
	}

	attach()
	if (!isDone) void customElements.whenDefined(node.localName).then(() => requestAnimationFrame(attach))

	return {
		update(next: string) {
			sheet.replaceSync(next)
		}
	}
}
