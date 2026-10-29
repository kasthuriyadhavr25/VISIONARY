export function photoToSketch(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Choose an image file.')); return }
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, 500 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Unable to process image.')); return }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const gray = new Uint8Array(canvas.width * canvas.height)
      for (let i = 0; i < gray.length; i++) gray[i] = .299 * pixels.data[i * 4] + .587 * pixels.data[i * 4 + 1] + .114 * pixels.data[i * 4 + 2]
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const i = y * canvas.width + x
        const edge = Math.abs(gray[i] - gray[y * canvas.width + Math.min(x + 1, canvas.width - 1)]) + Math.abs(gray[i] - gray[Math.min(y + 1, canvas.height - 1) * canvas.width + x])
        const shade = Math.max(0, Math.min(255, 245 - edge * 2.4 - (255 - gray[i]) * .22))
        pixels.data[i * 4] = shade; pixels.data[i * 4 + 1] = shade; pixels.data[i * 4 + 2] = shade; pixels.data[i * 4 + 3] = 255
      }
      ctx.putImageData(pixels, 0, 0); resolve(canvas.toDataURL('image/jpeg', .85))
    }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unable to read image.')) }
    image.src = url
  })
}
