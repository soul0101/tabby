/**
 * Member colours at even perceptual weight, so a stacked split bar reads
 * evenly and no segment shouts louder than its share.
 */
export const MEMBER_HUES = [25, 250, 145, 300, 60, 335, 195, 100] as const

export const solid = (hue: number) => `oklch(0.62 0.13 ${hue})`
export const tint = (hue: number) => `oklch(0.95 0.035 ${hue})`
export const deep = (hue: number) => `oklch(0.42 0.11 ${hue})`

export const hueFor = (index: number) => MEMBER_HUES[index % MEMBER_HUES.length]
