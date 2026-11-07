import { addAudioFile } from '../store.svelte'

const AUDIO_ACCEPT = 'audio/wav,audio/mpeg,.wav,.mp3'
const VIDEO_ACCEPT = 'video/mp4,video/webm,.mp4,.webm'

// Opens the system file chooser for audio. Each file is a layer.
export const openAudioPicker = (): void => {
	const input = document.createElement('input')
	input.type = 'file'
	input.accept = AUDIO_ACCEPT
	input.onchange = () => {
		const file = input.files?.[0]
		if (file === undefined) return
		void addAudioFile(file)
	}
	input.click()
}

// Opens the system file chooser for a video layer.
export const openVideoPicker = (onfile: (file: File) => void): void => {
	const input = document.createElement('input')
	input.type = 'file'
	input.accept = VIDEO_ACCEPT
	input.onchange = () => {
		const file = input.files?.[0]
		if (file === undefined) return
		onfile(file)
	}
	input.click()
}

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
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

const PICTURE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg'

// Opens the system file chooser for any picture a layer can show.
export const openPicturePicker = (onfile: (file: File) => void): void => {
	const input = document.createElement('input')
	input.type = 'file'
	input.accept = PICTURE_ACCEPT
	input.onchange = () => {
		const file = input.files?.[0]
		if (file === undefined) return
		onfile(file)
	}
	input.click()
}
