import path from 'node:path';

import { app, type BrowserWindow } from 'electron';

import { recordOpenedExternalDocument } from './database/externalOpenedDocuments.js';
import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';

export const IPC_EXTERNAL_DOCUMENT_FILE_OPENED_CHANNEL = 'foliole:external-document-file-opened';

function isSupportedExternalDocumentPath(value: string) {
  const extension = path.extname(value).toLowerCase();
  return extension === '.md' || extension === '.markdown' || extension === '.txt';
}

export function resolveExternalDocumentFileArgs(argv: string[]) {
  return argv
    .filter((arg) => arg && !arg.startsWith('-'))
    .map((arg) => path.resolve(arg))
    .filter(isSupportedExternalDocumentPath);
}

function createUniqueQueue(paths: string[]) {
  return [...new Set(paths)];
}

export function installExternalDocumentFileOpenLifecycle() {
  let readyWindow: BrowserWindow | null = null;
  let pendingPaths = createUniqueQueue(resolveExternalDocumentFileArgs(process.argv));
  let isFlushing = false;

  async function flush() {
    if (isFlushing || !readyWindow || readyWindow.isDestroyed() || pendingPaths.length === 0) {
      return;
    }
    isFlushing = true;
    const nextPaths = pendingPaths;
    pendingPaths = [];
    for (const filePath of nextPaths) {
      try {
        const entry = await recordOpenedExternalDocument(filePath);
        if (entry && readyWindow && !readyWindow.isDestroyed()) {
          readyWindow.webContents.send(IPC_EXTERNAL_DOCUMENT_FILE_OPENED_CHANNEL, {
            absolutePath: entry.absolute_path,
            folderId: entry.folder_id
          });
        }
      } catch (error) {
        appendMainProcessDiagnosticLog('external_document_file_open_failed', { error, filePath });
      }
    }
    isFlushing = false;
    if (pendingPaths.length > 0) {
      await flush();
    }
  }

  function enqueue(paths: string[]) {
    pendingPaths = createUniqueQueue([...pendingPaths, ...paths]);
    void flush();
  }

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    enqueue([filePath]);
  });

  return {
    enqueueFromArgv: (argv: string[]) => enqueue(resolveExternalDocumentFileArgs(argv)),
    setReadyWindow: (window: BrowserWindow) => {
      readyWindow = window;
      void flush();
    }
  };
}
