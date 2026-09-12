import { promises as fs } from 'node:fs';
import path from 'node:path';

import { prepareCanonicalImageAttachment } from '../attachments/importImageAttachmentBytes.js';

const SUPPORTED_LOCAL_IMAGE_EXTENSIONS = new Set(['.gif', '.jpeg', '.jpg', '.png', '.webp']);
const UNSUPPORTED_LOCAL_IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.heic', '.heif', '.svg', '.tif', '.tiff']);

export type LocalImageInboxImportMode = 'local_image' | 'unsupported_local_image';

function stripFileExtension(fileName: string) {
  const extension = path.extname(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

export function resolveLocalImageInboxImportMode(filePath: string): LocalImageInboxImportMode | null {
  const extension = path.extname(filePath).toLowerCase();
  if (SUPPORTED_LOCAL_IMAGE_EXTENSIONS.has(extension)) {
    return 'local_image';
  }
  if (UNSUPPORTED_LOCAL_IMAGE_EXTENSIONS.has(extension)) {
    return 'unsupported_local_image';
  }
  return null;
}

export function createLocalImageInboxMarkdown(filePath: string) {
  const fileName = path.basename(filePath);
  const encodedName = encodeURIComponent(fileName);
  const altText = stripFileExtension(fileName).trim() || 'Imported image';
  return `![${altText}](./${encodedName})`;
}

export function createUnsupportedLocalImageMessage() {
  return 'Only png, jpg, jpeg, webp, and gif images are supported.';
}

export async function validateLocalImageInboxFile(filePath: string) {
  try {
    const bytes = await fs.readFile(filePath);
    return prepareCanonicalImageAttachment(bytes) ? null : 'The image file is invalid, unsupported, or too large.';
  } catch {
    return 'The source image could not be read.';
  }
}
