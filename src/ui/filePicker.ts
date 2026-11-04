import { loadAudioFile } from '../store.svelte'

// Opens the system file chooser. Video files are accepted too,
// for their audio track.
export const openAudioPicker = (): void => {
	const input = document.createElement('input')
	input.type = 'file'
	input.accept = 'audio/*,video/*,.wav,.mp3,.m4a,.aac,.ogg,.flac'
	input.onchange = () => {
		const file = input.files?.[0]
		if (file === undefined) return
		void loadAudioFile(file)
	}
	input.click()
}
