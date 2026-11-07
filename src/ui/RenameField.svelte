<script lang="ts">
	// A name field that commits once, as the whole name: on Enter
	// or when it loses focus. While it is focused, undo is the
	// field's own text undo and never touches the document.
	type RenameFieldPropsT = {
		value: string
		label: string
		limit?: number
		placeholder?: string
		oncommit: (name: string) => void
	}

	const props: RenameFieldPropsT = $props()

	const nameLimit = $derived(props.limit ?? 40)

	const handleChange = (event: Event) => {
		const next = (event as CustomEvent<{ value: string }>).detail.value.slice(0, nameLimit)
		if (next !== props.value) props.oncommit(next)
	}

	// Keys typed here are the field's own, never the editor's shortcuts.
	const handleKeyDown = (event: KeyboardEvent) => event.stopPropagation()
</script>

<z-input size="sm" value={props.value} placeholder={props.placeholder} aria-label={props.label} onchange={handleChange} onkeydown={handleKeyDown}></z-input>
