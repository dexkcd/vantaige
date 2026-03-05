/**
 * Compress a base64 JPEG/PNG to reduce payload size for Server Actions.
 * Resizes to max 512px and lowers quality to avoid "Maximum array nesting exceeded".
 */
export async function compressBase64Image(
  base64: string,
  maxWidth = 512,
  quality = 0.6
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxWidth || height > maxWidth) {
        const scale = maxWidth / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const b64 = dataUrl.split(',')[1];
      resolve(b64 ?? '');
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = `data:image/jpeg;base64,${base64}`;
  });
}
