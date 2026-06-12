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
  notifyManagedInboxUpdated: vi.fn()
}));

import { resetImportPathAuthorizationForTests } from './importPathAuthorization.js';
import { runTextFileImport, selectImportTextFile } from './importTextFile.js';

beforeEach(() => {
  vi.clearAllMocks();
  resetImportPathAuthorizationForTests();
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/book.epub'] });
  loadEpubPreview.mockResolvedValue('# Sample Book\n\n# Chapter 1\n\nBody');
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

it('routes EPUB previews and imports through the dedicated extractor', async () => {
  await expect(selectImportTextFile()).resolves.toEqual({
    content: '# Sample Book\n\n# Chapter 1\n\nBody',
    file_name: 'book.epub',
    file_path: '/tmp/book.epub',
    kind: 'epub'
  });

  await expect(runTextFileImport()).resolves.toEqual({
    content_fingerprint: 'epub-content-fingerprint',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-epub',
    imported_at: '2026-03-22T12:10:00.000Z',
    node_id: 'node-import-epub',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'epub-source-fingerprint',
    source_kind: 'epub',
    source_locator: '/tmp/book.epub',
    source_name: 'book.epub'
  });

  expect(showOpenDialog).toHaveBeenCalledWith(
    expect.objectContaining({
      filters: [{ extensions: ['md', 'markdown', 'html', 'htm', 'txt', 'epub', 'pdf'], name: 'Markdown / HTML / Text / EPUB / PDF' }],
      properties: ['openFile', 'multiSelections']
    })
  );
  expect(loadEpubPreview).toHaveBeenCalledWith(
    expect.objectContaining({ filePath: '/tmp/book.epub', kind: 'epub', sourceName: 'book.epub' })
  );
  expect(runEpubImport).toHaveBeenCalledWith(
    expect.objectContaining({ filePath: '/tmp/book.epub', kind: 'epub', sourceName: 'book.epub' }),
    expect.any(String),
    {}
  );
  expect(readFile).not.toHaveBeenCalled();
  expect(runPreparedImport).not.toHaveBeenCalled();
});
