// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { readFile, runPreparedImport, showOpenDialog } = vi.hoisted(() => ({
  readFile: vi.fn(),
  runPreparedImport: vi.fn(),
  showOpenDialog: vi.fn()
}));

const { loadEpubPreview, runEpubImport } = vi.hoisted(() => ({
  loadEpubPreview: vi.fn(),
  runEpubImport: vi.fn()
}));

const { notifyManagedInboxUpdated } = vi.hoisted(() => ({
  notifyManagedInboxUpdated: vi.fn()
}));

vi.mock('electron', () => ({
  dialog: { showOpenDialog }
}));

vi.mock('node:fs/promises', () => ({
  default: { readFile },
  readFile
}));

vi.mock('../database/importPipeline.js', () => ({
  recordPreparedImportFailure: vi.fn(),
  runPreparedImport
}));

vi.mock('./epubImport.js', () => ({
  loadEpubPreview,
  runEpubImport
}));

vi.mock('../import/managedInboxEvents.js', () => ({
  notifyManagedInboxUpdated
}));

import { runTextFileImport } from './importTextFile.js';

beforeEach(() => {
  vi.clearAllMocks();
  runEpubImport.mockResolvedValue({
    contentFingerprint: 'epub-content-fingerprint',
    degradedReason: null,
    duplicateSemantic: 'new',
    failureReason: null,
    importId: 'import-epub',
    importedAt: '2026-03-22T12:10:00.000Z',
    nodeId: 'node-import-epub',
    provider: 'desktop_text_file',
    resultStatus: 'imported',
    sourceFingerprint: 'epub-source-fingerprint',
    sourceKind: 'epub',
    sourceLocator: '/tmp/book.epub',
    sourceName: 'book.epub'
  });
});

it('imports the selected EPUB path with the requested release mode without reopening the picker', async () => {
  await expect(runTextFileImport(undefined, {
    file_path: '/tmp/book.epub',
    sequential_reading_mode: 'sequential'
  })).resolves.toMatchObject({
    import_id: 'import-epub',
    source_kind: 'epub'
  });

  expect(showOpenDialog).not.toHaveBeenCalled();
  expect(runEpubImport).toHaveBeenCalledWith(
    expect.objectContaining({ filePath: '/tmp/book.epub', kind: 'epub', sourceName: 'book.epub' }),
    expect.any(String),
    { sequentialReadingMode: 'sequential' }
  );
  expect(notifyManagedInboxUpdated).toHaveBeenCalledWith('import-epub');
});
