// Buttons act the moment the pointer goes down, and do not take
// focus, so Space keeps playing. A click that comes from the
// keyboard (detail 0) still works, for anyone who Tabs to it.
export type PressHandlersT = {
	onpointerdown: (event: PointerEvent) => void
	onclick: (event: MouseEvent) => void
}

export const press = (action: () => void): PressHandlersT => ({
	onpointerdown: (event: PointerEvent) => {
		const isPrimaryButton = event.button === 0
		if (!isPrimaryButton) return
		event.preventDefault()
		action()
	},
	onclick: (event: MouseEvent) => {
		const isKeyboardClick = event.detail === 0
		if (isKeyboardClick) action()
	}
})
