import { checkIsMidiFile } from './midiImport.svelte'

export type DroppedKindT = 'midi' | 'audio' | 'video' | 'image' | 'unknown'

const AUDIO_EXTENSIONS = ['.wav', '.mp3']
const VIDEO_EXTENSIONS = ['.mp4', '.webm']
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']

const hasExtension = (file: File, extensions: string[]): boolean => {
	const name = file.name.toLowerCase()
	return extensions.some((extension) => name.endsWith(extension))
}

const checkHasType = (file: File, prefix: string): boolean => file.type.startsWith(prefix)

// What a dropped file should become, by its type and its name.
export const readDroppedKind = (file: File): DroppedKindT => {
	const isMidi = checkIsMidiFile(file)
	if (isMidi) return 'midi'
	const isAudio = checkHasType(file, 'audio/') || hasExtension(file, AUDIO_EXTENSIONS)
	if (isAudio) return 'audio'
	const isVideo = checkHasType(file, 'video/') || hasExtension(file, VIDEO_EXTENSIONS)
	if (isVideo) return 'video'
	const isImage = checkHasType(file, 'image/') || hasExtension(file, IMAGE_EXTENSIONS)
	if (isImage) return 'image'
	return 'unknown'
}
