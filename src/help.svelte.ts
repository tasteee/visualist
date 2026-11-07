// Help text for whatever the pointer is over. The text is what each
// control's tooltip would say. For now it shows in the editor's overview
// label, and the tooltips themselves are switched off. Set
// SHOW_TOOLTIPS to true to get them back.
const SHOW_TOOLTIPS = false

export const help = $state<{ text: string }>({ text: '' })

type TooltipElementT = HTMLElement & { content?: string; isDisabled?: boolean }

const findTooltip = (event: Event): TooltipElementT | null => {
	for (const node of event.composedPath()) {
		if (node instanceof HTMLElement && node.tagName === 'Z-TOOLTIP') return node as TooltipElementT
	}
	return null
}

const readText = (tooltip: TooltipElementT): string => tooltip.content ?? tooltip.getAttribute('content') ?? ''

export const installHelpText = (): (() => void) => {
	// Capture runs before the tooltip's own listeners, so it can be
	// switched off before it would open.
	const handleOver = (event: Event) => {
		const tooltip = findTooltip(event)
		if (tooltip === null) {
			help.text = ''
			return
		}
		if (!SHOW_TOOLTIPS) tooltip.isDisabled = true
		help.text = readText(tooltip)
	}
	const handleFocus = (event: Event) => {
		const tooltip = findTooltip(event)
		if (tooltip !== null && !SHOW_TOOLTIPS) tooltip.isDisabled = true
	}
	const handleLeave = () => {
		help.text = ''
	}
	window.addEventListener('pointerover', handleOver, true)
	window.addEventListener('focusin', handleFocus, true)
	document.documentElement.addEventListener('pointerleave', handleLeave)
	return () => {
		window.removeEventListener('pointerover', handleOver, true)
		window.removeEventListener('focusin', handleFocus, true)
		document.documentElement.removeEventListener('pointerleave', handleLeave)
	}
}
