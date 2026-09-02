// @vitest-environment node

import { expect, it, vi } from 'vitest';

const { clipboard, clipboardImage, notifyManagedInboxUpdated, runPreparedImport } = vi.hoisted(() => {
  const image = {
    isEmpty: vi.fn(() => true),
    toPNG: vi.fn(() => Buffer.from('png-bytes'))
  };
  return {
    clipboard: {
      availableFormats: vi.fn(() => []),
      read: vi.fn(() => ''),
      readBuffer: vi.fn(() => Buffer.alloc(0)),
      readHTML: vi.fn(() => ''),
      readImage: vi.fn(() => image),
      readText: vi.fn(() => '')
    },
    clipboardImage: image,
    notifyManagedInboxUpdated: vi.fn(),
    runPreparedImport: vi.fn()
  };
});

vi.mock('../clipboardAccess.js', () => ({ electronClipboardAccess: clipboard }));
vi.mock('./clipboardFilePaths.js', () => ({ collectClipboardFilePaths: vi.fn(async () => []) }));
vi.mock('../database/importPipeline.js', () => ({ runPreparedImport }));
vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated }));
vi.mock('../attachments/importImageAttachmentBytes.js', () => ({
  importImageAttachmentBytes: vi.fn(),
  normalizeImageFileName: vi.fn((name: string) => name)
}));
vi.mock('../database/connection.js', () => ({ openDatabaseConnection: vi.fn() }));

import { runClipboardImport } from './importClipboard.js';

function createImportRecord() {
  return {
    contentFingerprint: 'content-fingerprint',
    degradedReason: null,
    duplicateSemantic: 'new',
    failureReason: null,
    importId: 'import-1',
    importedAt: '2026-04-26T10:00:00.000Z',
    nodeId: 'node-1',
    provider: 'desktop_text_file' as const,
    resultStatus: 'imported' as const,
    sourceFingerprint: 'source-fingerprint',
    sourceKind: 'text' as const,
    sourceLocator: 'clipboard://text/2026-04-26T10:00:00.000Z',
    sourceName: 'Clipboard Text.txt'
  };
}

it('passes the requested parent when importing plain clipboard text', async () => {
  clipboard.readText.mockReturnValue('# Clipboard topic\n\nBody');
  runPreparedImport.mockReturnValue(createImportRecord());

  await expect(runClipboardImport({ target_parent_node_id: 'node-target' })).resolves.toMatchObject({
    import_id: 'import-1',
    node_id: 'node-1'
  });

  expect(runPreparedImport).toHaveBeenCalledWith(
    expect.objectContaining({
      nodeTitle: 'Clipboard topic',
      targetParentNodeId: 'node-target'
    })
  );
  expect(notifyManagedInboxUpdated.mock.calls[0]?.[0]).toBe('import-1');
});

it('ignores a blank requested parent when importing plain clipboard text', async () => {
  clipboard.readText.mockReturnValue('# Clipboard topic\n\nBody');
  runPreparedImport.mockReturnValue(createImportRecord());

  await runClipboardImport({ target_parent_node_id: '   ' });

  expect(runPreparedImport).toHaveBeenCalledWith(
    expect.not.objectContaining({
      targetParentNodeId: expect.anything()
    })
  );
  expect(clipboardImage.isEmpty).toHaveBeenCalled();
});
