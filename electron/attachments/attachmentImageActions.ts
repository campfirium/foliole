import fs from 'node:fs/promises';
import path from 'node:path';

import { clipboard, dialog, nativeImage, type BrowserWindow } from 'electron';

import type {
  NativeCopyAttachmentImageResult,
  NativeExportAttachmentImageResult
} from '../../lib/platform/nativeUtilityContract.js';
import { findAttachmentRecordById } from '../database/attachments.js';

import { resolveAttachmentFile } from './resourceResolver.js';

function resolveFallbackFileName(attachmentId: string, originalName: string | null, mimeType: string | null) {
  const trimmedName = originalName?.trim() ?? '';
  if (trimmedName) {
    return path.basename(trimmedName);
  }
  if (mimeType === 'image/jpeg') {
    return `${attachmentId}.jpg`;
  }
  if (mimeType === 'image/gif') {
    return `${attachmentId}.gif`;
  }
  if (mimeType === 'image/webp') {
    return `${attachmentId}.webp`;
  }
  return `${attachmentId}.png`;
}

function resolveDialogFilters(fileName: string, mimeType: string | null) {
  const extension = path.extname(fileName).replace(/^\./, '').toLowerCase();
  if (extension) {
    return [{ extensions: [extension], name: 'Image files' }];
  }
  if (mimeType === 'image/jpeg') {
    return [{ extensions: ['jpg', 'jpeg'], name: 'JPEG images' }];
  }
  if (mimeType === 'image/gif') {
    return [{ extensions: ['gif'], name: 'GIF images' }];
  }
  if (mimeType === 'image/webp') {
    return [{ extensions: ['webp'], name: 'WebP images' }];
  }
  return [{ extensions: ['png'], name: 'PNG images' }];
}

export function copyAttachmentImageToClipboard(attachmentId: string): NativeCopyAttachmentImageResult {
  const resolved = resolveAttachmentFile(attachmentId);
  if (resolved.status !== 'ready') {
    return { status: resolved.status };
  }

  const image = nativeImage.createFromPath(resolved.filePath);
  if (image.isEmpty()) {
    return { status: 'invalid_image' };
  }

  clipboard.writeImage(image);
  return { status: 'copied' };
}

export async function exportAttachmentImage(
  attachmentId: string,
  window: BrowserWindow | null
): Promise<NativeExportAttachmentImageResult> {
  const resolved = resolveAttachmentFile(attachmentId);
  if (resolved.status !== 'ready') {
    return { path: null, status: resolved.status };
  }

  const record = findAttachmentRecordById(attachmentId);
  const defaultFileName = resolveFallbackFileName(attachmentId, record?.originalName ?? null, resolved.mimeType);
  const dialogOptions = {
    buttonLabel: 'Save image',
    defaultPath: defaultFileName,
    filters: resolveDialogFilters(defaultFileName, resolved.mimeType),
    title: 'Export image'
  };
  const selection = window
    ? await dialog.showSaveDialog(window, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);

  if (selection.canceled || !selection.filePath) {
    return { path: null, status: 'cancelled' };
  }

  try {
    await fs.copyFile(resolved.filePath, selection.filePath);
    return { path: selection.filePath, status: 'saved' };
  } catch {
    return { path: null, status: 'save_failed' };
  }
}
