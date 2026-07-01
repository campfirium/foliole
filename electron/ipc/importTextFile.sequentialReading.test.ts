// @vitest-environment node

import path from 'node:path';

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

const epubPath = path.resolve('/tmp/book.epub');

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

import {
  authorizeSelectedImportFilePath,
  resetImportPathAuthorizationForTests
} from './importPathAuthorization.js';
import { runTextFileImport } from './importTextFile.js';

beforeEach(() => {
  vi.clearAllMocks();
  resetImportPathAuthorizationForTests();
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
    sourceLocator: epubPath,
    sourceName: 'book.epub'
  });
});

it('imports the selected EPUB path with the requested release mode without reopening the picker', async () => {
  await authorizeSelectedImportFilePath(epubPath);

  await expect(runTextFileImport(undefined, {
    file_path: epubPath,
    sequential_reading_mode: 'sequential'
  })).resolves.toMatchObject({
    import_id: 'import-epub',
    source_kind: 'epub'
  });

  expect(showOpenDialog).not.toHaveBeenCalled();
  expect(runEpubImport).toHaveBeenCalledWith(
    expect.objectContaining({ filePath: epubPath, kind: 'epub', sourceName: 'book.epub' }),
    expect.any(String),
    { sequentialReadingMode: 'sequential' }
  );
  expect(notifyManagedInboxUpdated.mock.calls[0]?.[0]).toBe('import-epub');
});

it('rejects renderer-provided EPUB paths that were not selected by the main process', async () => {
  await expect(runTextFileImport(undefined, {
    file_path: epubPath,
    sequential_reading_mode: 'sequential'
  })).rejects.toThrow('Import file path is not authorized.');
});
