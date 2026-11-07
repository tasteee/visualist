<script lang="ts">
	import './RenameField.css'

	// A name field that commits once, as the whole name: on Enter
	// or when it loses focus. While it is focused, undo is the
	// field's own text undo and never touches the document.
	type RenameFieldPropsT = {
		value: string
		label: string
		limit?: number
		oncommit: (name: string) => void
	}

	const props: RenameFieldPropsT = $props()

	let draft = $state<string | null>(null)

	const shownValue = $derived(draft ?? props.value)
	const nameLimit = $derived(props.limit ?? 40)

	const handleInput = (event: Event) => {
		const input = event.currentTarget as HTMLInputElement
		draft = input.value
	}

	const commit = () => {
		const pendingName = draft
		draft = null
		if (pendingName === null) return
		const isChange = pendingName !== props.value
		if (isChange) props.oncommit(pendingName)
	}

	const handleKeyDown = (event: KeyboardEvent) => {
		event.stopPropagation()
		const input = event.currentTarget as HTMLInputElement
		const isEnter = event.key === 'Enter'
		if (isEnter) input.blur()
		const isEscape = event.key === 'Escape'
		if (!isEscape) return
		draft = null
		input.blur()
	}
</script>

<input
	class="rename-field"
	type="text"
	value={shownValue}
	maxlength={nameLimit}
	spellcheck="false"
	aria-label={props.label}
	oninput={handleInput}
	onblur={commit}
	onkeydown={handleKeyDown}
/>
