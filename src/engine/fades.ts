// 0 is fully faded out, 1 is fully visible.
export const getFadeLevel = (elapsed: number, length: number, fadeIn: number, fadeOut: number): number => {
	const hasFadeIn = fadeIn > 0
	const hasFadeOut = fadeOut > 0
	const fadeInLevel = hasFadeIn ? elapsed / fadeIn : 1
	const fadeOutLevel = hasFadeOut ? (length - elapsed) / fadeOut : 1
	const level = Math.min(fadeInLevel, fadeOutLevel, 1)
	return Math.max(0, level)
}
