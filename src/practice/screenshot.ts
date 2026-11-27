export async function readScreenshot(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 8 * 1024 * 1024) {
    throw new Error('请选择 8 MB 以内的 PNG、JPEG 或 WebP 截图。');
  }
  const image = await createImageBitmap(file).catch(() => {
    throw new Error('无法打开这张截图，请重新截图。');
  });
  try {
    const scale = Math.min(1, 2048 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法生成截图预览，请重新截图。');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.92);
  } finally {
    image.close();
  }
}
