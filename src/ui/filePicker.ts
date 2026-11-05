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

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif'
const SVG_ACCEPT = 'image/svg+xml,.svg'

export type LayerFileKindT = 'image' | 'svg'

// Opens the system file chooser for a picture layer.
export const openLayerFilePicker = (kind: LayerFileKindT, onfile: (file: File) => void): void => {
	const input = document.createElement('input')
	input.type = 'file'
	input.accept = kind === 'svg' ? SVG_ACCEPT : IMAGE_ACCEPT
	input.onchange = () => {
		const file = input.files?.[0]
		if (file === undefined) return
		onfile(file)
	}
	input.click()
}

const MIDI_ACCEPT = '.mid,.midi,audio/midi,audio/x-midi'

// Opens the system file chooser for a MIDI file.
export const openMidiPicker = (onfile: (file: File) => void): void => {
	const input = document.createElement('input')
	input.type = 'file'
	input.accept = MIDI_ACCEPT
	input.onchange = () => {
		const file = input.files?.[0]
		if (file === undefined) return
		onfile(file)
	}
	input.click()
}
