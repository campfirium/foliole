import path from 'node:path';

import { imageMimeTypeFromExtension } from '../../lib/core/import/epub/epubImageMimeType.js';

export function resolveImageMimeType(fileNameOrPath: string) {
  return imageMimeTypeFromExtension(path.extname(fileNameOrPath));
}
