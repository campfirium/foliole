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

import { runTextFileImport, selectImportTextFile } from './importTextFile.js';

beforeEach(() => {
  vi.clearAllMocks();
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/paper.pdf'] });
  runPreparedImport.mockReturnValue({
    contentFingerprint: 'pdf-content-fingerprint',
    degradedReason: null,
    duplicateSemantic: 'new',
    failureReason: null,
    importId: 'import-pdf',
    importedAt: '2026-03-22T12:20:00.000Z',
    nodeId: 'node-import-pdf',
    provider: 'desktop_text_file',
    resultStatus: 'imported',
    sourceFingerprint: 'pdf-source-fingerprint',
    sourceKind: 'pdf',
    sourceLocator: '/tmp/paper.pdf',
    sourceName: 'paper.pdf'
  });
});

it('supports selecting and importing PDF files through the manual import flow', async () => {
  await expect(selectImportTextFile()).resolves.toEqual({
    content: '# paper\n\nLinked PDF source ready for the reader surface.',
    file_name: 'paper.pdf',
    file_path: '/tmp/paper.pdf',
    kind: 'pdf'
  });

  await expect(runTextFileImport()).resolves.toEqual({
    content_fingerprint: 'pdf-content-fingerprint',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-pdf',
    imported_at: '2026-03-22T12:20:00.000Z',
    node_id: 'node-import-pdf',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'pdf-source-fingerprint',
    source_kind: 'pdf',
    source_locator: '/tmp/paper.pdf',
    source_name: 'paper.pdf'
  });

  expect(showOpenDialog).toHaveBeenCalledWith({
    filters: [{ extensions: ['md', 'markdown', 'html', 'htm', 'txt', 'epub', 'pdf'], name: 'Markdown / HTML / Text / EPUB / PDF' }],
    properties: ['openFile', 'multiSelections']
  });
  expect(runPreparedImport).toHaveBeenCalledWith(
    expect.objectContaining({
      content: '# paper\n\nLinked PDF source ready for the reader surface.',
      sourceKind: 'pdf',
      sourceLocator: '/tmp/paper.pdf',
      sourceName: 'paper.pdf'
    })
  );
  expect(loadEpubPreview).not.toHaveBeenCalled();
  expect(runEpubImport).not.toHaveBeenCalled();
  expect(readFile).not.toHaveBeenCalled();
});
