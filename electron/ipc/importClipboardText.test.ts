// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { clipboard, clipboardImage, notifyManagedInboxUpdated, runPreparedImport } = vi.hoisted(() => ({
  clipboard: {
    readHTML: vi.fn(() => ''),
    readImage: vi.fn(() => ({ isEmpty: vi.fn(() => true) })),
    readText: vi.fn(() => '')
  },
  clipboardImage: {
    isEmpty: vi.fn(() => true)
  },
  notifyManagedInboxUpdated: vi.fn(),
  runPreparedImport: vi.fn()
}));

vi.mock('electron', () => ({ clipboard }));
vi.mock('./clipboardFilePaths.js', () => ({ collectClipboardFilePaths: vi.fn(async () => []) }));
vi.mock('../database/importPipeline.js', () => ({ runPreparedImport }));
vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated }));

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
    sourceName: 'Clipboard topic Body',
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clipboard.readHTML.mockReturnValue('');
  clipboard.readText.mockReturnValue('');
  clipboardImage.isEmpty.mockReturnValue(true);
  clipboard.readImage.mockReturnValue(clipboardImage);
  runPreparedImport.mockReturnValue(createImportRecord());
});

it('imports plain clipboard text with a readable content source name', async () => {
  clipboard.readText.mockReturnValue('# Clipboard topic\n\nBody');

  await expect(runClipboardImport()).resolves.toMatchObject({
    import_id: 'import-1',
    source_kind: 'text',
    source_name: 'Clipboard topic Body'
  });

  expect(runPreparedImport).toHaveBeenCalledWith(expect.objectContaining({
    content: '# Clipboard topic\n\nBody',
    nodeTitle: 'Clipboard topic',
    sourceKind: 'text',
    sourceName: 'Clipboard topic Body'
  }));
  expect(notifyManagedInboxUpdated).toHaveBeenCalledWith('import-1');
});

it('imports plain clipboard text containing malformed URI escapes instead of failing path detection', async () => {
  clipboard.readText.mockReturnValue('# Clipboard topic\n\nLarge section is 100% incomplete');
  runPreparedImport.mockReturnValue(createImportRecord({
    sourceName: 'Clipboard topic Large section is 100% incomplete'
  }));

  await expect(runClipboardImport()).resolves.toMatchObject({
    source_name: 'Clipboard topic Large section is 100% incomplete'
  });

  expect(runPreparedImport).toHaveBeenCalledWith(expect.objectContaining({
    content: '# Clipboard topic\n\nLarge section is 100% incomplete',
    sourceKind: 'text',
    sourceName: 'Clipboard topic Large section is 100% incomplete'
  }));
});

it('prefers clipboard HTML and names it from converted readable content', async () => {
  clipboard.readHTML.mockReturnValue('<h1>Rich topic</h1><p><strong>Body</strong></p>');
  clipboard.readText.mockReturnValue('Rich topic\nBody');
  runPreparedImport.mockReturnValue(createImportRecord({ sourceKind: 'html', sourceName: 'Rich topic Body' }));

  await expect(runClipboardImport()).resolves.toMatchObject({
    source_kind: 'html',
    source_name: 'Rich topic Body'
  });

  expect(runPreparedImport).toHaveBeenCalledWith(expect.objectContaining({
    content: '# Rich topic\n\n**Body**',
    nodeTitle: 'Rich topic',
    sourceKind: 'html',
    sourceName: 'Rich topic Body'
  }));
});
