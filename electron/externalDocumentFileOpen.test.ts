import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadExternalSearchFolders: vi.fn((): Array<{ folder_path: string }> => []),
  readLocalFile: vi.fn(async (filePath: string) => ({ absolutePath: filePath, status: 'ready' })),
  recordOpenedExternalDocument: vi.fn()
}));

vi.mock('electron', () => ({
  app: {
    on: vi.fn()
  }
}));

vi.mock('./database/externalOpenedDocuments.js', () => ({
  recordOpenedExternalDocument: mocks.recordOpenedExternalDocument
}));

vi.mock('./database/externalSearchFolders.js', () => ({
  loadExternalSearchFolders: mocks.loadExternalSearchFolders
}));

vi.mock('./database/localFiles.js', () => ({
  readLocalFile: mocks.readLocalFile
}));

vi.mock('./diagnostics/mainProcessDiagnostics.js', () => ({
  appendMainProcessDiagnosticLog: vi.fn()
}));

import { installExternalDocumentFileOpenLifecycle, resolveExternalDocumentFileArgs } from './externalDocumentFileOpen.js';

it('extracts supported Markdown file paths from launch arguments', () => {
  expect(resolveExternalDocumentFileArgs([
    '/opt/Foliole/foliole.exe',
    '--original-process-start-time=123',
    '/Users/example/Inbox/read.md',
    '/Users/example/Inbox/skip.pdf',
    '/Users/example/Inbox/reference.markdown'
  ])).toEqual([
    '/Users/example/Inbox/read.md',
    '/Users/example/Inbox/reference.markdown'
  ]);
});

it('sends OS-opened files outside external search folders as local file events', async () => {
  const lifecycle = installExternalDocumentFileOpenLifecycle();
  const window = {
    isDestroyed: () => false,
    webContents: { send: vi.fn() }
  };

  lifecycle.setReadyWindow(window as never);
  lifecycle.enqueueFromArgv(['/app/foliole', '/outside/read.md']);
  await vi.waitFor(() => {
    expect(window.webContents.send).toHaveBeenCalledWith('foliole:local-file-opened', { absolutePath: '/outside/read.md' });
  });
  expect(mocks.recordOpenedExternalDocument).not.toHaveBeenCalled();
});

it('keeps OS-opened files inside external search folders on the read-only external document path', async () => {
  mocks.loadExternalSearchFolders.mockReturnValue([{ folder_path: '/library' }]);
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
      absolutePath: '/library/read.md',
      folderId: 'folder-1'
    });
  });
  expect(mocks.readLocalFile).not.toHaveBeenCalledWith('/library/read.md');
});
