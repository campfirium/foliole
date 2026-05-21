import { beforeEach, expect, it, vi } from 'vitest';

const {
  requestEpubImportReleaseMode,
  runRuntimeTextFileImport,
  selectRuntimeImportTextFile
} = vi.hoisted(() => ({
  requestEpubImportReleaseMode: vi.fn(),
  runRuntimeTextFileImport: vi.fn(),
  selectRuntimeImportTextFile: vi.fn()
}));

vi.mock('../../shared/platform/importExecutionRuntimeRepository', () => ({
  runRuntimeTextFileImport,
  selectRuntimeImportTextFile
}));

vi.mock('./epubImportReleaseModeDialogStore', () => ({
  requestEpubImportReleaseMode
}));

import { runFormalImportFileFlow } from './formalImportFileFlow';

beforeEach(() => {
  vi.clearAllMocks();
  runRuntimeTextFileImport.mockResolvedValue(null);
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

it('passes the selected EPUB release mode into the import command', async () => {
  const selectedFile = {
    content: '# Book',
    fileName: 'book.epub',
    filePath: '/tmp/book.epub',
    kind: 'epub'
  };
  selectRuntimeImportTextFile.mockResolvedValue(selectedFile);
  requestEpubImportReleaseMode.mockResolvedValue('free');

  await runFormalImportFileFlow();

  expect(requestEpubImportReleaseMode).toHaveBeenCalledWith(selectedFile);
  expect(runRuntimeTextFileImport).toHaveBeenCalledWith(undefined, undefined, {
    filePath: '/tmp/book.epub',
    sequentialReadingMode: 'free'
  });
});

it('does not import when the EPUB release mode dialog is canceled', async () => {
  selectRuntimeImportTextFile.mockResolvedValue({
    content: '# Book',
    fileName: 'book.epub',
    filePath: '/tmp/book.epub',
    kind: 'epub'
  });
  requestEpubImportReleaseMode.mockResolvedValue(null);

  await expect(runFormalImportFileFlow()).resolves.toBeNull();

  expect(runRuntimeTextFileImport).not.toHaveBeenCalled();
});
