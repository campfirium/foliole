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
import { resetAppliedImportWorkspacePatches } from './formalImportWorkspacePatch';

beforeEach(() => {
  vi.clearAllMocks();
  resetAppliedImportWorkspacePatches();
  runRuntimeTextFileImport.mockResolvedValue(null);
  storeRehydrate.mockResolvedValue(undefined);
});

it('imports the selected non-EPUB file without opening the release mode dialog', async () => {
  selectRuntimeImportTextFile.mockResolvedValue([{
    content: '# Note',
    fileName: 'note.md',
    filePath: '/tmp/note.md',
    kind: 'markdown'
  }]);

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

  selectRuntimeImportTextFile.mockResolvedValue([{
    content: '# Note',
    fileName: 'note.md',
    filePath: '/tmp/note.md',
    kind: 'markdown'
  }]);

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
  selectRuntimeImportTextFile.mockResolvedValue([selectedFile]);
  runRuntimeTextFileImport.mockResolvedValue({ importId: 'import-book', nodeId: 'node-book', resultStatus: 'imported' });
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
  selectRuntimeImportTextFile.mockResolvedValue([{
    content: '# Book',
    fileName: 'book.epub',
    filePath: '/tmp/book.epub',
    kind: 'epub'
  }]);
  runRuntimeTextFileImport.mockResolvedValue({ importId: 'import-book', nodeId: 'node-book', resultStatus: 'imported' });
  requestEpubImportReleaseMode.mockResolvedValue(null);

  await expect(runFormalImportFileFlow()).resolves.toEqual({
    importId: 'import-book',
    nodeId: 'node-book',
    resultStatus: 'imported'
  });

  expect(runRuntimeTextFileImport).toHaveBeenCalledWith(undefined, undefined, {
    filePath: '/tmp/book.epub'
  });
  expect(setNodeSequentialReading).not.toHaveBeenCalled();
});

it('imports every selected file and refreshes each successful result before continuing', async () => {
  selectRuntimeImportTextFile.mockResolvedValue([
    { content: '', fileName: 'first.md', filePath: '/tmp/first.md', kind: 'markdown' },
    { content: '', fileName: 'second.txt', filePath: '/tmp/second.txt', kind: 'text' }
  ]);
  runRuntimeTextFileImport
    .mockResolvedValueOnce({ importId: 'batch-first', nodeId: 'first', resultStatus: 'imported' })
    .mockImplementationOnce(async () => {
      expect(storeRehydrate).toHaveBeenCalledTimes(1);
      return { importId: 'batch-second', nodeId: 'second', resultStatus: 'imported' };
    });

  await expect(runFormalImportFileFlow()).resolves.toMatchObject({ importId: 'batch-second' });
  expect(runRuntimeTextFileImport.mock.calls.map((call) => call[2]?.filePath))
    .toEqual(['/tmp/first.md', '/tmp/second.txt']);
  expect(storeRehydrate).toHaveBeenCalledTimes(2);
});

it('continues after an import failure without hiding the failed result', async () => {
  selectRuntimeImportTextFile.mockResolvedValue([
    { content: '', fileName: 'broken.txt', filePath: '/tmp/broken.txt', kind: 'text' },
    { content: '', fileName: 'good.txt', filePath: '/tmp/good.txt', kind: 'text' }
  ]);
  runRuntimeTextFileImport
    .mockResolvedValueOnce({ importId: 'batch-failure', nodeId: null, resultStatus: 'failed' })
    .mockResolvedValueOnce({ importId: 'batch-good', nodeId: 'good', resultStatus: 'imported' });

  await expect(runFormalImportFileFlow()).resolves.toMatchObject({ resultStatus: 'failed' });
  expect(runRuntimeTextFileImport).toHaveBeenCalledTimes(2);
  expect(storeRehydrate).toHaveBeenCalledTimes(1);
});

it('continues to the next EPUB after dismissing the first reading-mode choice', async () => {
  const files = ['first', 'second'].map((name) => ({
    content: '# Book', fileName: `${name}.epub`, filePath: `/tmp/${name}.epub`, kind: 'epub' as const
  }));
  selectRuntimeImportTextFile.mockResolvedValue(files);
  runRuntimeTextFileImport
    .mockResolvedValueOnce({ importId: 'first-book', nodeId: 'first-book', resultStatus: 'imported' })
    .mockResolvedValueOnce({ importId: 'second-book', nodeId: 'second-book', resultStatus: 'imported' });
  requestEpubImportReleaseMode.mockResolvedValueOnce(null).mockResolvedValueOnce('sequential');

  await runFormalImportFileFlow();

  expect(requestEpubImportReleaseMode.mock.calls.map((call) => call[0])).toEqual(files);
  expect(storeRehydrate).toHaveBeenCalledTimes(2);
  expect(setNodeSequentialReading.mock.calls).toEqual([['second-book', true]]);
});
