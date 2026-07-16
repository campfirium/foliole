import path from 'node:path';

import { app, dialog, type BrowserWindow } from 'electron';

import { OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID } from './database/externalOpenedDocumentConstants.js';
import { readLocalFile } from './database/localFiles.js';
import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import { IPC_EXTERNAL_DOCUMENT_FILE_OPENED_CHANNEL } from './ipc/contracts.js';
import { ensureMacosFileSecurityScopedAccess } from './macosFileSecurityBookmarks.js';

type EnqueuePaths = (paths: string[]) => number;

let enqueueExternalDocumentPaths: EnqueuePaths | null = null;

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

function authorizeExternalDocumentPaths(paths: string[]) {
  return createUniqueQueue(paths)
    .map((filePath) => path.resolve(filePath))
    .filter(isSupportedExternalDocumentPath)
    .filter((filePath) => {
      const access = ensureMacosFileSecurityScopedAccess(filePath);
      if (access.status !== 'error') return true;
      appendMainProcessDiagnosticLog('external_document_file_authorization_failed', {
        errorCode: access.errorCode,
        filePath,
        message: access.message
      });
      return false;
    });
}

class ExternalDocumentOpenQueue {
  private isFlushing = false;
  private pendingPaths: string[] = [];
  private readyWindow: BrowserWindow | null = null;

  enqueue(paths: string[]) {
    const acceptedPaths = authorizeExternalDocumentPaths(paths);
    this.pendingPaths = createUniqueQueue([...this.pendingPaths, ...acceptedPaths]);
    void this.flush();
    return acceptedPaths.length;
  }

  setReadyWindow(window: BrowserWindow) {
    this.readyWindow = window;
    void this.flush();
  }

  private async flush() {
    if (
      this.isFlushing ||
      !this.readyWindow ||
      this.readyWindow.isDestroyed() ||
      this.pendingPaths.length === 0
    ) return;
    this.isFlushing = true;
    try {
      const nextPaths = this.pendingPaths;
      this.pendingPaths = [];
      for (const filePath of nextPaths) await this.openFile(filePath);
    } finally {
      this.isFlushing = false;
    }
    if (this.pendingPaths.length > 0) await this.flush();
  }

  private async openFile(filePath: string) {
    try {
      const result = await readLocalFile(filePath);
      if (result.status !== 'ready' || !this.readyWindow || this.readyWindow.isDestroyed()) return;
      this.readyWindow.webContents.send(IPC_EXTERNAL_DOCUMENT_FILE_OPENED_CHANNEL, {
        absolutePath: result.absolutePath,
        folderId: OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID,
        sourceKind: 'local_file'
      });
    } catch (error) {
      appendMainProcessDiagnosticLog('external_document_file_open_failed', { error, filePath });
    }
  }
}

export async function selectLocalFileToOpen() {
  if (!enqueueExternalDocumentPaths) {
    return { message: 'The file open lifecycle is unavailable.', status: 'error' as const };
  }
  const result = await dialog.showOpenDialog({
    filters: [
      { extensions: ['md', 'markdown'], name: 'Markdown' },
      { extensions: ['txt'], name: 'Text' }
    ],
    properties: ['openFile'],
    title: 'Open File'
  });
  if (result.canceled || !result.filePaths[0]) return { status: 'cancelled' as const };
  const absolutePath = path.resolve(result.filePaths[0]);
  const accepted = enqueueExternalDocumentPaths([absolutePath]);
  return accepted > 0
    ? { absolutePath, status: 'selected' as const }
    : { message: 'The selected file could not be authorized.', status: 'error' as const };
}

export function installExternalDocumentFileOpenLifecycle() {
  const queue = new ExternalDocumentOpenQueue();
  enqueueExternalDocumentPaths = (paths) => queue.enqueue(paths);
  queue.enqueue(resolveExternalDocumentFileArgs(process.argv));
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    queue.enqueue([filePath]);
  });

  return {
    enqueueFromArgv: (argv: string[]) => queue.enqueue(resolveExternalDocumentFileArgs(argv)),
    setReadyWindow: (window: BrowserWindow) => queue.setReadyWindow(window)
  };
}
