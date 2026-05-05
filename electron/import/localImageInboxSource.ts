import { promises as fs } from 'node:fs';
import path from 'node:path';

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

function hasPngSignature(bytes: Uint8Array) {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function hasJpegSignature(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function hasGifSignature(bytes: Uint8Array) {
  const signature = Buffer.from(bytes.subarray(0, 6)).toString('ascii');
  return signature === 'GIF87a' || signature === 'GIF89a';
}

function hasWebpSignature(bytes: Uint8Array) {
  return Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP';
}

function isSupportedImageBytes(filePath: string, bytes: Uint8Array) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') {
    return hasPngSignature(bytes);
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return hasJpegSignature(bytes);
  }
  if (extension === '.gif') {
    return hasGifSignature(bytes);
  }
  if (extension === '.webp') {
    return hasWebpSignature(bytes);
  }
  return false;
}

export async function validateLocalImageInboxFile(filePath: string) {
  try {
    const bytes = await fs.readFile(filePath);
    return isSupportedImageBytes(filePath, bytes) ? null : 'The image file is invalid or corrupted.';
  } catch {
    return 'The source image could not be read.';
  }
}
