import { beforeEach, expect, it, vi } from 'vitest';

const {
  requestEpubImportReleaseMode,
  runRuntimeTextFileImport,
  setNodeSequentialReading,
  storeRehydrate,
  selectRuntimeImportTextFile
} = vi.hoisted(() => ({
  requestEpubImportReleaseMode: vi.fn(),
  runRuntimeTextFileImport: vi.fn(),
  setNodeSequentialReading: vi.fn(),
  storeRehydrate: vi.fn(),
  selectRuntimeImportTextFile: vi.fn()
}));

vi.mock('../../shared/platform/importExecutionRuntimeRepository', () => ({
  runRuntimeTextFileImport,
  selectRuntimeImportTextFile
}));

vi.mock('./epubImportReleaseModeDialogStore', () => ({
  requestEpubImportReleaseMode
}));

vi.mock('../../store/workspaceStore', () => ({
  useWorkspaceStore: {
    getState: () => ({ setNodeSequentialReading }),
    persist: { rehydrate: storeRehydrate }
  }
}));

import { runFormalImportFileFlow } from './formalImportFileFlow';

beforeEach(() => {
  vi.clearAllMocks();
  runRuntimeTextFileImport.mockResolvedValue(null);
  storeRehydrate.mockResolvedValue(undefined);
});

it('imports the selected non-EPUB file without opening the release mode dialog', async () => {
  selectRuntimeImportTextFile.mockResolvedValue({
    content: '# Note',
    fileName: 'note.md',
    filePath: '/tmp/note.md',
    kind: 'markdown'
  });

  await runFormalImportFileFlow();

  expect(requestEpubImportReleaseMode).not.toHaveBeenCalled();
  expect(runRuntimeTextFileImport).toHaveBeenCalledWith(undefined, undefined, {
    filePath: '/tmp/note.md'
  });
});

it('notifies import start only after a file is selected', async () => {
  const onImportStarted = vi.fn();
  selectRuntimeImportTextFile.mockResolvedValue(null);

  await runFormalImportFileFlow({ onImportStarted });

  expect(onImportStarted).not.toHaveBeenCalled();

  selectRuntimeImportTextFile.mockResolvedValue({
    content: '# Note',
    fileName: 'note.md',
    filePath: '/tmp/note.md',
    kind: 'markdown'
  });

  await runFormalImportFileFlow({ onImportStarted });

  expect(onImportStarted).toHaveBeenCalledTimes(1);
});

it('imports the selected EPUB before asking for a post-import reading mode', async () => {
  const selectedFile = {
    content: '# Book',
    fileName: 'book.epub',
    filePath: '/tmp/book.epub',
    kind: 'epub'
  };
  selectRuntimeImportTextFile.mockResolvedValue(selectedFile);
  runRuntimeTextFileImport.mockResolvedValue({ nodeId: 'node-book', resultStatus: 'imported' });
  requestEpubImportReleaseMode.mockResolvedValue('free');

  await runFormalImportFileFlow();

  expect(requestEpubImportReleaseMode).toHaveBeenCalledWith(selectedFile);
  expect(runRuntimeTextFileImport).toHaveBeenCalledWith(undefined, undefined, {
    filePath: '/tmp/book.epub'
  });
  expect(storeRehydrate).toHaveBeenCalledTimes(1);
  expect(setNodeSequentialReading).toHaveBeenCalledWith('node-book', false);
});

it('keeps the imported EPUB when the post-import reading mode dialog is dismissed', async () => {
  selectRuntimeImportTextFile.mockResolvedValue({
    content: '# Book',
    fileName: 'book.epub',
    filePath: '/tmp/book.epub',
    kind: 'epub'
  });
  runRuntimeTextFileImport.mockResolvedValue({ nodeId: 'node-book', resultStatus: 'imported' });
  requestEpubImportReleaseMode.mockResolvedValue(null);

  await expect(runFormalImportFileFlow()).resolves.toEqual({ nodeId: 'node-book', resultStatus: 'imported' });

  expect(runRuntimeTextFileImport).toHaveBeenCalledWith(undefined, undefined, {
    filePath: '/tmp/book.epub'
  });
  expect(setNodeSequentialReading).not.toHaveBeenCalled();
});
