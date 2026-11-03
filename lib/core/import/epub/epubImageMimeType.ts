import { epubPath as path } from './epubPath.js';

const IMAGE_FILE_MIME_TYPES = new Map([
  ['.gif', 'image/gif'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'], ['.webp', 'image/webp']
]);

export function resolveImageMimeType(fileNameOrPath: string) {
  return imageMimeTypeFromExtension(path.extname(fileNameOrPath));
}

export function imageMimeTypeFromExtension(extension: string) {
  return IMAGE_FILE_MIME_TYPES.get(extension.toLowerCase()) ?? null;
}
