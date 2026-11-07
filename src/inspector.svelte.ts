// The toolbar menus in the top right corner. At most one is open.
export type InspectorTabT = 'settings' | 'palette' | 'post' | 'export' | 'options'

type InspectorStateT = {
	activeTab: InspectorTabT | null
}

export const inspector = $state<InspectorStateT>({
	activeTab: null
})

export const showInspectorTab = (tab: InspectorTabT): void => {
	inspector.activeTab = tab
}

export const closeInspectorTab = (): void => {
	inspector.activeTab = null
}

export const toggleInspectorTab = (tab: InspectorTabT): void => {
	const isOpen = inspector.activeTab === tab
	inspector.activeTab = isOpen ? null : tab
}
