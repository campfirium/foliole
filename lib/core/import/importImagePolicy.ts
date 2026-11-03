import { isDataUrlDestination, normalizeSafeMarkdownDataImageUrl } from '../../platform/markdownImageDataUrl.js';

import type { ImportSourceKind } from './contract.js';

const IMAGE_EXTENSIONS = new Set(['gif', 'jpeg', 'jpg', 'png', 'webp']);

export function isUnmanagedImportImage(destination: string, syntax: 'markdown' | 'obsidian') {
  let remote = false;
  try { remote = ['http:', 'https:'].includes(new URL(destination).protocol); } catch { /* Relative file reference. */ }
  if (remote || isDataUrlDestination(destination) || normalizeSafeMarkdownDataImageUrl(destination)
    || destination.startsWith('asset://')) return false;
  let decoded = destination;
  try { decoded = decodeURIComponent(destination); } catch { /* Preserve a malformed source path. */ }
  const filename = decoded.replace(/[\\/]+$/u, '').split(/[\\/]/u).pop() ?? '';
  const dot = filename.lastIndexOf('.');
  const extension = dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
  return syntax === 'markdown' || IMAGE_EXTENSIONS.has(extension);
}

export function formatImportImageDegradation(kind: ImportSourceKind, messages: string[]) {
  return messages.length ? `${kind === 'html' ? 'HTML' : 'Markdown'} local image import degraded: ${messages.join(' | ')}` : null;
}
