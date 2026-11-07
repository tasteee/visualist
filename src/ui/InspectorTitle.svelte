<script lang="ts">
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon'

	// The panel's title with a pencil beside it. One input, read-only until
	// the pencil is pressed, so the name looks identical in both states and
	// ellipsizes when it overflows. Enter or leaving the field commits,
	// Escape cancels.
	type InspectorTitlePropsT = {
		value: string
		label: string
		limit?: number
		size?: 'xs' | 'sm' | 'md'
		oncommit: (name: string) => void
	}

	const props: InspectorTitlePropsT = $props()

	let isEditing = $state(false)
	let isCancelled = false
	let input = $state<HTMLInputElement | undefined>()

	const nameLimit = $derived(props.limit ?? 40)

	// The tooltip only earns its place when the name is cut off.
	let isOverflowing = $state(false)

	const measure = () => {
		isOverflowing = input !== undefined && input.scrollWidth > input.clientWidth
	}

	const handleEdit = () => {
		isCancelled = false
		isEditing = true
		input?.focus()
		input?.select()
	}

	const finish = () => {
		if (!isEditing || input === undefined) return
		isEditing = false
		const next = input.value.trim().slice(0, nameLimit)
		if (isCancelled || next === '' && props.value === '') {
			input.value = props.value
		} else if (next !== props.value) {
			props.oncommit(next)
		}
		input.setSelectionRange(0, 0)
	}

	const handleKeyDown = (event: KeyboardEvent) => {
		// Keys typed here are the field's own, never the editor's shortcuts.
		event.stopPropagation()
		if (!isEditing) return
		if (event.key === 'Enter') input?.blur()
		else if (event.key === 'Escape') {
			isCancelled = true
			input?.blur()
		}
	}

	// A new name from outside replaces what the input shows.
	$effect(() => {
		if (input === undefined || isEditing) return
		input.value = props.value
		input.scrollLeft = 0
		// Measure once the new text has laid out, so the tooltip is right
		// after an edit without needing a fresh hover.
		void props.value
		requestAnimationFrame(measure)
	})
</script>

<div class="inspector-title">
	<z-tooltip class="inspector-title-tip" content={props.value} isDisabled={isEditing || !isOverflowing} placement="bottom" openDelay={300} onpointerenter={measure}>
	<input
		bind:this={input}
		class="inspector-title-input is-{props.size ?? 'xs'}"
		class:isEditing
		type="text"
		value={props.value}
		readonly={!isEditing}
		tabindex={isEditing ? 0 : -1}
		maxlength={nameLimit}
		aria-label={props.label}
		onblur={finish}
		onkeydown={handleKeyDown}
		style="pointer-events: none"
	/>
	</z-tooltip>
	<z-tooltip content="Rename" placement="top" openDelay={300}>
		<z-button size="sm" kind="ghost" tone="neutral" aria-label={props.label} onclick={handleEdit}>
			<PencilSimpleIcon class="inspector-panel-header-edit-icon" weight="bold" />
		</z-button>
	</z-tooltip>
</div>

<style>
	.inspector-title {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		min-width: 0;
	}

	/* Matches z-heading so the name does not change look when edited. */
	.inspector-title-tip {
		display: block;
		flex: 1;
		min-width: 0;
	}

	.inspector-title-input {
		width: 100%;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
		border-bottom: 1px solid transparent;
		border-radius: 0;
		background: transparent;
		color: var(--inspector-title-color, var(--foreground));
		font-family: var(--font-heading, inherit);
		font-variation-settings: var(--font-heading-settings, normal);
		font-weight: var(--font-heading-weight, 700);
		text-overflow: ellipsis;
		outline: none;
		cursor: default;
	}

	.inspector-title-input.is-md {
		font-size: calc(var(--base-font-size, 16px) * 2.5);
		line-height: 1.3;
		letter-spacing: calc(var(--base-font-size, 16px) * -0.03375 * var(--font-heading-tracking-scale, 1));
	}

	.inspector-title-input.is-sm {
		font-size: calc(var(--base-font-size, 16px) * 2);
		line-height: 1.25;
		letter-spacing: calc(var(--base-font-size, 16px) * -0.03 * var(--font-heading-tracking-scale, 1));
	}

	.inspector-title-input.is-xs {
		font-size: calc(var(--base-font-size, 16px) * 1.5);
		line-height: 1.333333;
		letter-spacing: calc(var(--base-font-size, 16px) * -0.00625 * var(--font-heading-tracking-scale, 1));
	}

	/* Editing shows only a thin underline and a caret. */
	.inspector-title-input.isEditing {
		border-bottom-color: var(--accent-alt);
		cursor: text;
		text-overflow: clip;
	}
</style>
