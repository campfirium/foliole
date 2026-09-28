import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { dialog, type BrowserWindow } from 'electron';

import type { NativeReadwiseOriginalEpubExportResult } from '../../lib/platform/nativeReadwiseContract.js';

import { fetchOriginalEpubRemoteRoot } from './readwiseOriginalEpubRemote.js';
import {
  loadReadwiseOriginalEpubTarget,
  readReadwiseOriginalEpubRuntimeStatus
} from './readwiseOriginalEpubTarget.js';
import { downloadReadwiseOriginalFile } from './readwiseOriginalFileDownload.js';

function suggestedName(title: string) {
  const stem = title.replace(/[<>:"/\\|?*]/gu, '_').trim().slice(0, 120) || 'Book';
  return `${stem}.epub`;
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /^[a-z0-9_]+$/u.test(message) ? message.slice(0, 120) : 'original_epub_export_failed';
}

export async function exportReadwiseOriginalEpub(
  nodeId: string,
  window: BrowserWindow | null
): Promise<NativeReadwiseOriginalEpubExportResult> {
  const target = loadReadwiseOriginalEpubTarget(nodeId);
  if (!target) return { node_id: nodeId, path: null, status: 'not_applicable' };
  if (readReadwiseOriginalEpubRuntimeStatus(target) !== 'ready') {
    return { node_id: nodeId, path: null, status: 'source_inactive' };
  }

  const options = {
    buttonLabel: 'Export',
    defaultPath: suggestedName(target.title),
    filters: [{ extensions: ['epub'], name: 'EPUB files' }],
    title: 'Export original EPUB'
  };
  const selection = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
  if (selection.canceled || !selection.filePath) {
    return { node_id: nodeId, path: null, status: 'cancelled' };
  }

  try {
    if (readReadwiseOriginalEpubRuntimeStatus(target) !== 'ready') {
      return { node_id: nodeId, path: null, status: 'source_inactive' };
    }
    const remote = await fetchOriginalEpubRemoteRoot({ documentId: target.documentId });
    const bytes = await downloadReadwiseOriginalFile(remote.rawSourceUrl, 'epub');
    const destination = selection.filePath;
    const temporaryPath = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporaryPath, bytes, { flag: 'wx' });
      await fs.rename(temporaryPath, destination);
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
    return { node_id: nodeId, path: selection.filePath, status: 'saved' };
  } catch (error) {
    return { error_code: errorCode(error), node_id: nodeId, path: null, status: 'failed' };
  }
}
