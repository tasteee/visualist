import { checkIsTextControl } from './keyboard'

// Focus belongs to the editor shell. After a pointer
// interaction, focus goes back to it, so Space plays. Only text
// fields keep focus while they are being used.
//
// Keyboard users are not trapped: Tab onto a button and Space
// and Enter still press that button, because the shell only
// takes focus back after a pointer.

let shellElement: HTMLElement | null = null

const readDeepActiveElement = (): Element | null => {
	let active: Element | null = document.activeElement
	while (active !== null && active.shadowRoot !== null && active.shadowRoot.activeElement !== null) {
		active = active.shadowRoot.activeElement
	}
	return active
}

export const focusShell = (): void => {
	const shell = shellElement
	if (shell === null) return
	const active = document.activeElement
	const isActiveElement = active instanceof HTMLElement && active !== shell
	if (isActiveElement) active.blur()
	shell.focus({ preventScroll: true })
}

// Gives focus back unless a text field is in use.
export const releaseFocusAfterPointer = (): void => {
	const active = readDeepActiveElement()
	const isTextField = checkIsTextControl(active)
	if (isTextField) return
	focusShell()
}

// Which modifier keys are really held. A trackpad pinch reports
// Ctrl on its own, so the event flag alone can not tell.
const heldModifiers = { isControlHeld: false, isMetaHeld: false }

export const checkIsPrimaryModifierHeld = (): boolean => heldModifiers.isControlHeld || heldModifiers.isMetaHeld

export const installFocusGuard = (shell: HTMLElement): (() => void) => {
	shellElement = shell

	const handlePointerUp = () => {
		// Wait a turn so the control finishes handling its click.
		window.setTimeout(releaseFocusAfterPointer, 0)
	}

	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Control') heldModifiers.isControlHeld = true
		if (event.key === 'Meta') heldModifiers.isMetaHeld = true
	}

	const handleKeyUp = (event: KeyboardEvent) => {
		if (event.key === 'Control') heldModifiers.isControlHeld = false
		if (event.key === 'Meta') heldModifiers.isMetaHeld = false
	}

	const handleWindowBlur = () => {
		heldModifiers.isControlHeld = false
		heldModifiers.isMetaHeld = false
	}

	window.addEventListener('pointerup', handlePointerUp, true)
	window.addEventListener('keydown', handleKeyDown, true)
	window.addEventListener('keyup', handleKeyUp, true)
	window.addEventListener('blur', handleWindowBlur)
	return () => {
		window.removeEventListener('pointerup', handlePointerUp, true)
		window.removeEventListener('keydown', handleKeyDown, true)
		window.removeEventListener('keyup', handleKeyUp, true)
		window.removeEventListener('blur', handleWindowBlur)
		shellElement = null
	}
}
