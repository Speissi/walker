export function downloadBlob(data: BlobPart | Uint8Array, mime: string, filename: string): void {
  const blob = new Blob([data as BlobPart], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const safeFilename = (name: string) => name.replace(/[^\w.-]+/g, '-')
