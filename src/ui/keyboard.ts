const TYPING_TAGS = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']

// Inputs that take typed text. Sliders, checkboxes and the like
// are inputs too, but they do not own Space.
const TEXT_INPUT_TYPES = ['text', 'search', 'number', 'email', 'url', 'tel', 'password']

const readOrigin = (event: KeyboardEvent): HTMLElement | null => {
	const origin = event.composedPath()[0]
	const isElement = origin instanceof HTMLElement
	if (!isElement) return null
	return origin
}

export const checkIsTextControl = (element: Element | null): boolean => {
	if (element === null) return false
	const isTextarea = element.tagName === 'TEXTAREA'
	if (isTextarea) return true
	const isInput = element instanceof HTMLInputElement
	if (isInput) return TEXT_INPUT_TYPES.includes(element.type)
	const isEditable = element instanceof HTMLElement && element.isContentEditable
	return isEditable
}

// True when the key lands in a field or button, where the key
// already means something and global shortcuts must stay out.
export const checkIsTyping = (event: KeyboardEvent): boolean => {
	const origin = readOrigin(event)
	if (origin === null) return false
	const isTypingTag = TYPING_TAGS.includes(origin.tagName)
	return isTypingTag || origin.isContentEditable
}

// True only in fields that take text. Buttons do not count, so
// a tap key still works right after clicking one.
export const checkIsTextEntry = (event: KeyboardEvent): boolean => {
	const origin = readOrigin(event)
	if (origin === null) return false
	const isSelect = origin.tagName === 'SELECT'
	if (isSelect) return true
	return checkIsTextControl(origin)
}
