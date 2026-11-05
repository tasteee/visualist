export type InspectorTabT = 'settings' | 'sources' | 'layers' | 'post' | 'export'

type InspectorStateT = {
	activeTab: InspectorTabT
}

// Lives outside the Inspector so the timeline can open the
// Layers tab when a layer is picked there.
export const inspector = $state<InspectorStateT>({
	activeTab: 'settings'
})

export const showInspectorTab = (tab: InspectorTabT): void => {
	inspector.activeTab = tab
}
