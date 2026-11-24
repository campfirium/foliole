import { randomUUID } from 'node:crypto';
import { renameSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { dialog, type BrowserWindow } from 'electron';

import type { NativeReadwiseOriginalEpubExportResult } from '../../lib/platform/nativeReadwiseContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { readReadwiseOriginalEpubDisconnectSignal } from './readwiseOriginalEpubDisconnect.js';
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
  const source = await runWithDatabaseConnectionOwner(() => {
    const target = loadReadwiseOriginalEpubTarget(nodeId);
    return target ? { target, status: readReadwiseOriginalEpubRuntimeStatus(target) } : null;
  });
  if (!source) return { node_id: nodeId, path: null, status: 'not_applicable' };
  const { target } = source;
  if (source.status !== 'ready') {
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

  const signal = readReadwiseOriginalEpubDisconnectSignal();
  try {
    const status = await runWithDatabaseConnectionOwner(() => {
      signal.throwIfAborted();
      return readReadwiseOriginalEpubRuntimeStatus(target);
    });
    if (status !== 'ready') {
      return { node_id: nodeId, path: null, status: 'source_inactive' };
    }
    const remote = await fetchOriginalEpubRemoteRoot({ dependencies: { signal }, documentId: target.documentId });
    signal.throwIfAborted();
    const bytes = await downloadReadwiseOriginalFile(remote.rawSourceUrl, 'epub', { signal });
    await saveOriginalEpub(selection.filePath, bytes, signal);
    return { node_id: nodeId, path: selection.filePath, status: 'saved' };
  } catch (error) {
    if (signal.aborted) return { error_code: 'readwise_disconnected', node_id: nodeId, path: null, status: 'cancelled' };
    return { error_code: errorCode(error), node_id: nodeId, path: null, status: 'failed' };
  }
}

async function saveOriginalEpub(destination: string, bytes: Uint8Array, signal: AbortSignal) {
  const temporaryPath = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporaryPath, bytes, { flag: 'wx', signal });
    signal.throwIfAborted();
    // Keep the final check and replacement in the same main-process turn as disconnect.
    renameSync(temporaryPath, destination);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}
