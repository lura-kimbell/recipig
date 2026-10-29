/**
 * Recipe photos uploaded from the cook's own device (as opposed to an image link). The
 * browser shrinks a photo before sending it; it is stored in the database (Render's disk
 * doesn't last between deploys) and served at /api/images/<id>, which is what the recipe's
 * `image` holds. Only the owner can fetch one.
 */

export interface StoredImage {
  contentType: UploadType;
  data: Buffer;
}

export const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];

/** Larger than any photo the browser sends after shrinking it. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const UPLOADED = /^\/api\/images\/([0-9a-f-]{36})$/;

/** The address a recipe uses for an uploaded image. */
export const uploadedImageUrl = (id: string): string => `/api/images/${id}`;

/** The id of an uploaded image, if `url` points at one. */
export function uploadedImageId(url: string | undefined): string | undefined {
  return url ? UPLOADED.exec(url)?.[1] : undefined;
}

/** Whether the bytes really are the kind of image they claim to be (the first few bytes say). */
export function looksLike(type: UploadType, data: Buffer): boolean {
  switch (type) {
    case 'image/jpeg':
      return data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    case 'image/png':
      return data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/webp':
      return data.length > 12 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP';
  }
}
