import path from 'node:path';

const IMAGE_FILE_MIME_TYPES = new Map([
  ['.gif', 'image/gif'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'], ['.webp', 'image/webp']
]);

export function resolveImageMimeType(fileNameOrPath: string) {
  return IMAGE_FILE_MIME_TYPES.get(path.extname(fileNameOrPath).toLowerCase()) ?? null;
}
