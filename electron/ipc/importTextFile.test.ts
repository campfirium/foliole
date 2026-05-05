// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { readFile, runPreparedImport, showOpenDialog } = vi.hoisted(() => ({
  readFile: vi.fn(),
  runPreparedImport: vi.fn(),
  showOpenDialog: vi.fn()
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

import { runTextFileImport, selectImportTextFile } from './importTextFile.js';

const DEGRADED_HTML =
  '<table><tr><th>Name</th><th>Value</th></tr><tr><td>Alpha</td><td>Beta</td></tr></table><iframe src="https://example.com/embed"></iframe>';

beforeEach(() => {
  vi.clearAllMocks();
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/inbox.html'] });
  readFile.mockResolvedValue('<h2>Imported</h2><p><strong>Bold</strong> text</p>');
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
