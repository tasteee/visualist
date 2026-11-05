const TYPING_TAGS = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']

// True when the key lands in a field or button, where the key
// already means something and global shortcuts must stay out.
export const checkIsTyping = (event: KeyboardEvent): boolean => {
	const origin = event.composedPath()[0]
	const isElement = origin instanceof HTMLElement
	if (!isElement) return false
	const isTypingTag = TYPING_TAGS.includes(origin.tagName)
	return isTypingTag || origin.isContentEditable
}

const TEXT_ENTRY_TAGS = ['INPUT', 'TEXTAREA', 'SELECT']

// True only in fields that take text. Buttons do not count, so
// a tap key still works right after clicking one.
export const checkIsTextEntry = (event: KeyboardEvent): boolean => {
	const origin = event.composedPath()[0]
	const isElement = origin instanceof HTMLElement
	if (!isElement) return false
	const isTextTag = TEXT_ENTRY_TAGS.includes(origin.tagName)
	return isTextTag || origin.isContentEditable
}
