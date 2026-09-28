import fs from 'node:fs/promises';
import path from 'node:path';

import { dialog, type BrowserWindow } from 'electron';

import type { NativeExportNodePdfResult } from '../../lib/platform/nativeUtilityContract.js';
import { loadAttachmentResourceDescription } from '../database/attachmentResourceDescription.js';
import { listNodeAttachments } from '../database/attachments.js';
import { loadNodeSourceDetails } from '../database/nodeSourceDetails.js';

import { resolveAttachmentFile } from './resourceResolver.js';

function suggestedPdfName(originalName: string | null) {
  const name = path.win32.basename(originalName?.trim() ?? '').trim();
  if (!name || name === '.' || name === '..') return 'Document.pdf';
  const safeName = name.replace(/[<>:"/\\|?*]/g, '_');
  return safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`;
}

export async function exportNodePdf(
  nodeId: string,
  window: BrowserWindow | null
): Promise<NativeExportNodePdfResult> {
  const link = listNodeAttachments(nodeId).find(
    (entry) => entry.role === 'reference' && entry.attachment.mimeType === 'application/pdf'
  );
  if (!link) return { path: null, status: 'not_found' };

  const description = loadAttachmentResourceDescription(link.attachmentId);
  if (!description || description.mimeType !== 'application/pdf') {
    return { path: null, status: 'not_found' };
  }
  const resolved = resolveAttachmentFile(description.storageKey);
  if (resolved.status !== 'ready') return { path: null, status: resolved.status };

  const options = {
    buttonLabel: 'Save PDF',
    defaultPath: suggestedPdfName(
      loadNodeSourceDetails(nodeId)?.importSource?.source_name ?? link.attachment.originalName
    ),
    filters: [{ extensions: ['pdf'], name: 'PDF files' }],
    title: 'Export PDF'
  };
  const selection = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
  if (selection.canceled || !selection.filePath) return { path: null, status: 'cancelled' };
  if (path.resolve(selection.filePath) === path.resolve(resolved.filePath)) {
    return { path: null, status: 'save_failed' };
  }

  try {
    await fs.writeFile(selection.filePath, resolved.bytes);
    return { path: selection.filePath, status: 'saved' };
  } catch {
    return { path: null, status: 'save_failed' };
  }
}
