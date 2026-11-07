// Whole-app view modes, both toggled from the keyboard.
type UiStateT = {
	// Backslash: hide every panel and see only the canvas.
	isUiHidden: boolean
	// Tilde: the stage over the whole app, for a close look.
	isStageFocused: boolean
	// The editor folded away into its toolbar.
	isDockFolded: boolean
}

export const uiState = $state<UiStateT>({ isUiHidden: false, isStageFocused: false, isDockFolded: false })

export const toggleUiHidden = (): void => {
	uiState.isUiHidden = !uiState.isUiHidden
}

export const toggleStageFocused = (): void => {
	uiState.isStageFocused = !uiState.isStageFocused
}

export const toggleDockFolded = (): void => {
	uiState.isDockFolded = !uiState.isDockFolded
}
