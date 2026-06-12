// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { clipboard, clipboardImage, notifyManagedInboxUpdated, runPreparedImport } = vi.hoisted(() => {
  const image = {
    isEmpty: vi.fn(() => true),
    toPNG: vi.fn(() => Buffer.from('png-bytes'))
  };
  return {
    clipboard: {
      readHTML: vi.fn(() => ''),
      readImage: vi.fn(() => image),
      readText: vi.fn(() => '')
    },
    clipboardImage: image,
    notifyManagedInboxUpdated: vi.fn(),
    runPreparedImport: vi.fn()
  };
});

vi.mock('electron', () => ({ clipboard }));
vi.mock('./clipboardFilePaths.js', () => ({ collectClipboardFilePaths: vi.fn(async () => []) }));
vi.mock('../database/importPipeline.js', () => ({ runPreparedImport }));
vi.mock('../attachments/importImageAttachmentBytes.js', () => ({
  importImageAttachmentBytes: vi.fn(),
  normalizeImageFileName: vi.fn((originalName: string | null | undefined) => originalName || 'pasted-image.png')
}));
vi.mock('../database/connection.js', () => ({ openDatabaseConnection: vi.fn() }));
vi.mock('../../lib/core/database/searchIndexInvalidations.js', () => ({
  enqueueWorkspaceSearchInvalidationForNodeIds: vi.fn()
}));
vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated }));
vi.mock('./importTextFile.js', async () => {
  const actual = await vi.importActual<typeof import('./importTextFile.js')>('./importTextFile.js');
  return { ...actual, runImportForFilePath: vi.fn() };
});

import { runClipboardImport } from './importClipboard.js';

function createImportRecord(overrides: Record<string, unknown> = {}) {
  return {
    contentFingerprint: 'content-fingerprint',
    degradedReason: null,
    duplicateSemantic: 'new',
    failureReason: null,
    importId: 'import-1',
    importedAt: '2026-04-26T10:00:00.000Z',
    nodeId: 'node-1',
    provider: 'desktop_text_file',
    resultStatus: 'imported',
    sourceFingerprint: 'source-fingerprint',
    sourceKind: 'text',
    sourceLocator: 'clipboard://text/2026-04-26T10:00:00.000Z',
    sourceName: 'Clipboard Text.txt',
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clipboard.readHTML.mockReturnValue('');
  clipboard.readText.mockReturnValue('');
  clipboardImage.isEmpty.mockReturnValue(true);
  runPreparedImport.mockImplementation((prepared) =>
    createImportRecord({
      sourceKind: prepared.sourceKind,
      sourceName: prepared.sourceName
    })
  );
});

it('imports VS Code copied markdown tables from plain text instead of syntax-highlight HTML', async () => {
  const table = '| A | B |\n| --- | --- |\n| 1 | 2 |';
  clipboard.readText.mockReturnValue(table);
  clipboard.readHTML.mockReturnValue(
    [
      '<div style="font-family: Cascadia Code; white-space: pre;">',
      '<span>| A | B |</span>',
      '<span>| --- | --- |</span>',
      '<span>| 1 | 2 |</span>',
      '</div>'
    ].join('')
  );

  await expect(runClipboardImport()).resolves.toMatchObject({
    source_kind: 'text',
    source_name: 'A B --- --- 1 2'
  });

  expect(runPreparedImport).toHaveBeenCalledWith(
    expect.objectContaining({
      content: table,
      sourceKind: 'text',
      sourceName: 'A B --- --- 1 2'
    })
  );
});

it('keeps rich clipboard HTML import when plain text is only a fallback', async () => {
  clipboard.readHTML.mockReturnValue('<h1>Rich topic</h1><p><strong>Body</strong></p>');
  clipboard.readText.mockReturnValue('Rich topic\nBody');
  runPreparedImport.mockImplementation((prepared) =>
    createImportRecord({
      sourceKind: prepared.sourceKind,
      sourceName: prepared.sourceName
    })
  );

  await expect(runClipboardImport()).resolves.toMatchObject({
    source_kind: 'html',
    source_name: 'Rich topic Body'
  });

  expect(runPreparedImport).toHaveBeenCalledWith(
    expect.objectContaining({
      content: '# Rich topic\n\n**Body**',
      nodeTitle: 'Rich topic',
      sourceKind: 'html',
      sourceName: 'Rich topic Body'
    })
  );
});
