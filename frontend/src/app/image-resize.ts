/**
 * A photo as a JPEG no bigger than `maxEdge` on its long side, the right way up. Phone
 * photos are several megabytes; this keeps uploads quick and storage small.
 */
export async function shrinkPhoto(file: Blob, maxEdge: number, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode'))), 'image/jpeg', quality),
    );
  } finally {
    bitmap.close();
  }
}
