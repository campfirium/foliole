import { hasSupportedImageSignature } from './imageByteSignature.js';

export const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);

export function isSupportedImageMimeType(mimeType: string) {
  return SUPPORTED_IMAGE_MIME_TYPES.has(mimeType.trim().toLowerCase());
}

export function validateSupportedImageBytes(bytes: Uint8Array, mimeType: string) {
  const normalizedMimeType = mimeType.trim().toLowerCase();
  return isSupportedImageMimeType(normalizedMimeType) && hasSupportedImageSignature(bytes, normalizedMimeType);
}
