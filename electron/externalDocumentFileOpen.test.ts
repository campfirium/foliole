import path from 'node:path';

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureAccess: vi.fn((): { status: 'not_required' } | {
    errorCode: string;
    message: string;
    status: 'error';
  } => ({ status: 'not_required' })),
  readLocalFile: vi.fn(async (filePath: string) => ({ absolutePath: filePath, status: 'ready' })),
  recordOpenedExternalDocument: vi.fn(),
  showOpenDialog: vi.fn()
}));

vi.mock('electron', () => ({
  app: {
    on: vi.fn()
  },
  dialog: { showOpenDialog: mocks.showOpenDialog }
}));

vi.mock('./database/externalOpenedDocuments.js', () => ({
  recordOpenedExternalDocument: mocks.recordOpenedExternalDocument
}));

vi.mock('./database/localFiles.js', () => ({
  readLocalFile: mocks.readLocalFile
}));

vi.mock('./diagnostics/mainProcessDiagnostics.js', () => ({
  appendMainProcessDiagnosticLog: vi.fn()
}));

vi.mock('./macosFileSecurityBookmarks.js', () => ({
  ensureMacosFileSecurityScopedAccess: mocks.ensureAccess
}));

import {
  installExternalDocumentFileOpenLifecycle,
  resolveExternalDocumentFileArgs,
  selectLocalFileToOpen
} from './externalDocumentFileOpen.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureAccess.mockReturnValue({ status: 'not_required' });
  mocks.readLocalFile.mockImplementation(async (filePath: string) => ({
    absolutePath: filePath,
    status: 'ready'
  }));
});

it('extracts supported Markdown file paths from launch arguments', () => {
  expect(resolveExternalDocumentFileArgs([
    '/opt/Foliole/foliole.exe',
    '--original-process-start-time=123',
    '/Users/example/Inbox/read.md',
    '/Users/example/Inbox/skip.pdf',
    '/Users/example/Inbox/reference.markdown'
  ])).toEqual([
    path.resolve('/Users/example/Inbox/read.md'),
    path.resolve('/Users/example/Inbox/reference.markdown')
  ]);
});

it('sends OS-opened files outside external search folders through the opened files event', async () => {
  const lifecycle = installExternalDocumentFileOpenLifecycle();
  const window = {
    isDestroyed: () => false,
    webContents: { send: vi.fn() }
  };

  lifecycle.setReadyWindow(window as never);
  lifecycle.enqueueFromArgv(['/app/foliole', '/outside/read.md']);
  await vi.waitFor(() => {
    expect(window.webContents.send).toHaveBeenCalledWith('foliole:external-document-file-opened', {
      absolutePath: path.resolve('/outside/read.md'),
      folderId: 'opened-external-documents',
      sourceKind: 'local_file'
    });
  });
  expect(mocks.recordOpenedExternalDocument).not.toHaveBeenCalled();
});

it('authorizes a path immediately before a ready window can flush it', () => {
  const lifecycle = installExternalDocumentFileOpenLifecycle();
  lifecycle.enqueueFromArgv(['/app/foliole', '/outside/early.md']);

  expect(mocks.ensureAccess).toHaveBeenCalledWith(path.resolve('/outside/early.md'));
  expect(mocks.readLocalFile).not.toHaveBeenCalledWith(path.resolve('/outside/early.md'));
});

it('does not queue a file when sandbox authorization fails', async () => {
  mocks.ensureAccess.mockReturnValueOnce({
    errorCode: 'access_failed',
    message: 'denied',
    status: 'error'
  });
  const lifecycle = installExternalDocumentFileOpenLifecycle();
  const window = {
    isDestroyed: () => false,
    webContents: { send: vi.fn() }
  };

  lifecycle.setReadyWindow(window as never);
  lifecycle.enqueueFromArgv(['/app/foliole', '/outside/denied.md']);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(mocks.readLocalFile).not.toHaveBeenCalledWith(path.resolve('/outside/denied.md'));
});

it('selects a local file and sends it through the installed open lifecycle', async () => {
  mocks.showOpenDialog.mockResolvedValue({
    canceled: false,
    filePaths: ['/outside/selected.md']
  });
  const lifecycle = installExternalDocumentFileOpenLifecycle();
  const window = {
    isDestroyed: () => false,
    webContents: { send: vi.fn() }
  };
  lifecycle.setReadyWindow(window as never);

  await expect(selectLocalFileToOpen()).resolves.toEqual({
    absolutePath: path.resolve('/outside/selected.md'),
    status: 'selected'
  });
  await vi.waitFor(() => expect(mocks.readLocalFile).toHaveBeenCalledWith(path.resolve('/outside/selected.md')));
});

it('sends OS-opened files inside external search folders through the editable local file path', async () => {
  mocks.recordOpenedExternalDocument.mockResolvedValue({ absolute_path: '/library/read.md', folder_id: 'folder-1' });
  const lifecycle = installExternalDocumentFileOpenLifecycle();
  const window = {
    isDestroyed: () => false,
    webContents: { send: vi.fn() }
  };

  lifecycle.setReadyWindow(window as never);
  lifecycle.enqueueFromArgv(['/app/foliole', '/library/read.md']);
  await vi.waitFor(() => {
    expect(window.webContents.send).toHaveBeenCalledWith('foliole:external-document-file-opened', {
      absolutePath: path.resolve('/library/read.md'),
      folderId: 'opened-external-documents',
      sourceKind: 'local_file'
    });
  });
  expect(mocks.readLocalFile).toHaveBeenCalledWith(path.resolve('/library/read.md'));
  expect(mocks.recordOpenedExternalDocument).not.toHaveBeenCalled();
});
