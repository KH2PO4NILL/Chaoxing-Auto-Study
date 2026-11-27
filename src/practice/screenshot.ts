export function encodeScreenshot(document: Document, image: CanvasImageSource, area: { x: number; y: number; width: number; height: number }): string {
  const { x, y, width, height } = area;
  const scale = Math.min(1, 2048 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法生成截图预览，请重新截图。');
  context.fillStyle = 'white';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function readScreenshot(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 8 * 1024 * 1024) {
    throw new Error('请选择 8 MB 以内的 PNG、JPEG 或 WebP 截图。');
  }
  const image = await createImageBitmap(file).catch(() => {
    throw new Error('无法打开这张截图，请重新截图。');
  });
  try {
    return encodeScreenshot(document, image, { x: 0, y: 0, width: image.width, height: image.height });
  } finally {
    image.close();
  }
}
