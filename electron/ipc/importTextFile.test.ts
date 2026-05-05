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

import { runTextFileImport, selectImportTextFile } from './importTextFile.js';

const DEGRADED_HTML =
  '<table><tr><th>Name</th><th>Value</th></tr><tr><td>Alpha</td><td>Beta</td></tr></table><iframe src="https://example.com/embed"></iframe>';

beforeEach(() => {
  vi.clearAllMocks();
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/inbox.html'] });
  readFile.mockResolvedValue('<h2>Imported</h2><p><strong>Bold</strong> text</p>');
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
  runPreparedImport.mockReturnValue({
    contentFingerprint: 'content-fingerprint',
    degradedReason: null,
    duplicateSemantic: 'new',
    failureReason: null,
    importId: 'import-1',
    importedAt: '2026-03-22T12:00:00.000Z',
    nodeId: 'node-import-1',
    provider: 'desktop_text_file',
    resultStatus: 'imported',
    sourceFingerprint: 'source-fingerprint',
    sourceKind: 'html',
    sourceLocator: '/tmp/inbox.html',
    sourceName: 'inbox.html'
  });
});

it('converts HTML selection into markdown-compatible text with visible degraded placeholders', async () => {
  readFile.mockResolvedValue(DEGRADED_HTML);

  await expect(selectImportTextFile()).resolves.toEqual({
    content: '[Table degraded]\nName | Value\nAlpha | Beta\n\n[Embedded iframe: https://example.com/embed]',
    file_name: 'inbox.html',
    file_path: '/tmp/inbox.html',
    kind: 'html'
  });
});

it('marks HTML file imports as degraded when conversion had to fall back', async () => {
  readFile.mockResolvedValue(DEGRADED_HTML);
  runPreparedImport.mockReturnValue({
    contentFingerprint: 'content-fingerprint',
    degradedReason: 'HTML conversion degraded: table, embedded content',
    duplicateSemantic: 'new',
    failureReason: null,
    importId: 'import-2',
    importedAt: '2026-03-22T12:05:00.000Z',
    nodeId: 'node-import-2',
    provider: 'desktop_text_file',
    resultStatus: 'degraded',
    sourceFingerprint: 'source-fingerprint',
    sourceKind: 'html',
    sourceLocator: '/tmp/inbox.html',
    sourceName: 'inbox.html'
  });

  await expect(runTextFileImport()).resolves.toEqual({
    content_fingerprint: 'content-fingerprint',
    degraded_reason: 'HTML conversion degraded: table, embedded content',
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-2',
    imported_at: '2026-03-22T12:05:00.000Z',
    node_id: 'node-import-2',
    provider: 'desktop_text_file',
    result_status: 'degraded',
    source_fingerprint: 'source-fingerprint',
    source_kind: 'html',
    source_locator: '/tmp/inbox.html',
    source_name: 'inbox.html'
  });

  expect(runPreparedImport).toHaveBeenCalledWith(
    expect.objectContaining({
      content: '[Table degraded]\nName | Value\nAlpha | Beta\n\n[Embedded iframe: https://example.com/embed]',
      degradedReason: 'HTML conversion degraded: table, embedded content',
      sourceKind: 'html',
      sourceLocator: '/tmp/inbox.html',
      sourceName: 'inbox.html'
    })
  );
});

it('supports adopting markdown highlight markers during import', async () => {
  readFile.mockResolvedValue('Use ==important== text');

  await expect(runTextFileImport(undefined, { highlight_policy: 'adopt' })).resolves.toEqual({
    content_fingerprint: 'content-fingerprint',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-1',
    imported_at: '2026-03-22T12:00:00.000Z',
    node_id: 'node-import-1',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'source-fingerprint',
    source_kind: 'html',
    source_locator: '/tmp/inbox.html',
    source_name: 'inbox.html'
  });

  expect(runPreparedImport).toHaveBeenCalledWith(
    expect.objectContaining({
      content: 'Use important text',
      matchedHighlights: [{ content: 'important', label: null }]
    })
  );
});

it('routes EPUB previews and imports through the dedicated extractor', async () => {
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/book.epub'] });

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
    expect.any(String)
  );
  expect(readFile).not.toHaveBeenCalled();
  expect(runPreparedImport).not.toHaveBeenCalled();
});


it('imports every selected file and returns the last import result', async () => {
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/first.md', '/tmp/second.md'] });
  runPreparedImport
    .mockReturnValueOnce({
      contentFingerprint: 'content-fingerprint-1',
      degradedReason: null,
      duplicateSemantic: 'new',
      failureReason: null,
      importId: 'import-1',
      importedAt: '2026-03-22T12:00:00.000Z',
      nodeId: 'node-import-1',
      provider: 'desktop_text_file',
      resultStatus: 'imported',
      sourceFingerprint: 'source-fingerprint-1',
      sourceKind: 'markdown',
      sourceLocator: '/tmp/first.md',
      sourceName: 'first.md'
    })
    .mockReturnValueOnce({
      contentFingerprint: 'content-fingerprint-2',
      degradedReason: null,
      duplicateSemantic: 'new',
      failureReason: null,
      importId: 'import-2',
      importedAt: '2026-03-22T12:01:00.000Z',
      nodeId: 'node-import-2',
      provider: 'desktop_text_file',
      resultStatus: 'imported',
      sourceFingerprint: 'source-fingerprint-2',
      sourceKind: 'markdown',
      sourceLocator: '/tmp/second.md',
      sourceName: 'second.md'
    });

  await expect(runTextFileImport()).resolves.toEqual({
    content_fingerprint: 'content-fingerprint-2',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-2',
    imported_at: '2026-03-22T12:01:00.000Z',
    node_id: 'node-import-2',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'source-fingerprint-2',
    source_kind: 'markdown',
    source_locator: '/tmp/second.md',
    source_name: 'second.md'
  });

  expect(runPreparedImport).toHaveBeenCalledTimes(2);
  expect(notifyManagedInboxUpdated).toHaveBeenNthCalledWith(1, 'import-1');
  expect(notifyManagedInboxUpdated).toHaveBeenNthCalledWith(2, 'import-2');
});
