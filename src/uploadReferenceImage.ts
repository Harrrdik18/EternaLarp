import { upload } from '@vercel/blob/client'

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const maxSize = 8_000_000

export async function uploadReferenceImage(file:File):Promise<string>{
  if (!allowedTypes.has(file.type)) throw new Error('Choose a PNG, JPEG, WebP, or GIF image.')
  if (file.size > maxSize) throw new Error('Images must be smaller than 8 MB.')

  const localDev = ['localhost','127.0.0.1'].includes(window.location.hostname)
  if (!localDev) {
    const blob = await upload(`${crypto.randomUUID()}-${file.name}`, file, {
      access: 'public',
      handleUploadUrl: '/api/uploads',
    })
    return blob.url
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read that image.'))
    reader.readAsDataURL(file)
  })
  const response = await fetch('/api/uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: file.name, mimeType: file.type, data: dataUrl.split(',')[1] }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Could not upload image.')
  return result.url
}
