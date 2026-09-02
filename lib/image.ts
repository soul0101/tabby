/**
 * Downscale a photo before we keep it.
 *
 * Phone cameras produce 3–8 MB images; a receipt only needs to be legible.
 * Capping the long edge keeps storage sane and uploads fast, and it is the
 * same size an agent's vision would want anyway.
 */
export async function downscale(file: File, maxEdge = 1400, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('That file isn’t an image.')

  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error('That image couldn’t be read.')

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser couldn’t process that image.')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  return canvas.toDataURL('image/jpeg', quality)
}
