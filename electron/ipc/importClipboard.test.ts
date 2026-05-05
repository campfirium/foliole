// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, expect, it, vi } from 'vitest';

const {
  clipboard,
  clipboardImage,
  runImportForFilePath,
  runPreparedImport,
  databaseDriver,
  importImageAttachmentBytes,
  notifyManagedInboxUpdated
} = vi.hoisted(() => {
  const driver = { execute: vi.fn(), query: vi.fn(), queryOne: vi.fn() };
  const image = {
    isEmpty: vi.fn(() => true),
    toPNG: vi.fn(() => Buffer.from('png-bytes'))
  };
  return {
    clipboard: {
      availableFormats: vi.fn((): string[] => []),
      read: vi.fn((format?: string) => {
        void format;
        return '';
      }),
      readBuffer: vi.fn((format?: string) => {
        void format;
        return Buffer.alloc(0);
      }),
      readHTML: vi.fn(() => ''),
      readImage: vi.fn(() => image),
      readText: vi.fn(() => '')
    },
    databaseDriver: driver,
    clipboardImage: image,
    importImageAttachmentBytes: vi.fn(),
    notifyManagedInboxUpdated: vi.fn(),
    runImportForFilePath: vi.fn(),
    runPreparedImport: vi.fn()
  };
});

vi.mock('electron', () => ({ clipboard }));
vi.mock('../database/importPipeline.js', () => ({ runPreparedImport }));
vi.mock('../attachments/importImageAttachmentBytes.js', () => ({
  importImageAttachmentBytes,
  normalizeImageFileName: vi.fn((originalName: string | null | undefined) => originalName || 'pasted-image.png')
}));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: vi.fn(() => ({ driver: databaseDriver }))
}));
vi.mock('../../lib/core/database/workspaceSearchIndex.js', () => ({ syncWorkspaceSearchIndexForNodeIds: vi.fn() }));
vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated }));
vi.mock('./importTextFile.js', async () => {
  const actual = await vi.importActual<typeof import('./importTextFile.js')>('./importTextFile.js');
  return { ...actual, runImportForFilePath };
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

function createNativeImportResult(overrides: Record<string, unknown> = {}) {
  return {
    content_fingerprint: 'content-fingerprint',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-1',
    imported_at: '2026-04-26T10:00:00.000Z',
    node_id: 'node-1',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'source-fingerprint',
    source_kind: 'text',
    source_locator: 'clipboard://text/2026-04-26T10:00:00.000Z',
    source_name: 'Clipboard Text.txt',
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clipboard.availableFormats.mockReturnValue([]);
  clipboard.read.mockReturnValue('');
  clipboard.readBuffer.mockReturnValue(Buffer.alloc(0));
  clipboard.readHTML.mockReturnValue('');
  clipboard.readText.mockReturnValue('');
  clipboardImage.isEmpty.mockReturnValue(true);
  clipboardImage.toPNG.mockReturnValue(Buffer.from('png-bytes'));
  runPreparedImport.mockReturnValue(createImportRecord());
  runImportForFilePath.mockResolvedValue(createNativeImportResult({ source_kind: 'pdf', source_name: 'document.pdf' }));
  importImageAttachmentBytes.mockResolvedValue({
    attachment_id: 'attachment-1',
    attachment_record: 'created',
    created_at: '2026-04-26T10:00:00.000Z',
    hash: 'attachment-1',
    mime_type: 'image/png',
    original_name: 'pasted-image.png',
    size_bytes: 9,
    status: 'imported',
    stored_file: 'created'
  });
});

it('imports a PDF copied as a Windows FileNameW text clipboard entry', async () => {
  clipboard.availableFormats.mockReturnValue(['FileNameW']);
  clipboard.read.mockImplementation((format?: string) => (format === 'FileNameW' ? '"C:\\Users\\me\\Desktop\\document.pdf"\u0000' : ''));

  await expect(runClipboardImport()).resolves.toMatchObject({
    source_kind: 'pdf',
    source_name: 'document.pdf'
  });

  expect(runImportForFilePath).toHaveBeenCalledWith('C:\\Users\\me\\Desktop\\document.pdf', undefined);
  expect(runPreparedImport).not.toHaveBeenCalled();
});

it('imports a JPG copied as a Windows FileNameW clipboard entry through the local image pipeline', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-clipboard-'));
  const imagePath = path.join(tempDir, 'photo.jpg');
  await fs.writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff]));
  clipboard.availableFormats.mockReturnValue(['FileNameW']);
  clipboard.readBuffer.mockImplementation((format?: string) =>
    format === 'FileNameW' ? Buffer.from(`${imagePath}\u0000`, 'utf16le') : Buffer.alloc(0)
  );
  runPreparedImport.mockReturnValue(createImportRecord({ sourceKind: 'markdown', sourceName: 'photo.jpg' }));

  await expect(runClipboardImport()).resolves.toMatchObject({
    source_kind: 'markdown',
    source_name: 'photo.jpg'
  });

  expect(runPreparedImport).toHaveBeenCalledWith(
    expect.objectContaining({
      content: '![photo](./photo.jpg)',
      sourceKind: 'markdown',
      sourceName: 'photo.jpg'
    })
  );
  expect(runImportForFilePath).not.toHaveBeenCalled();
  await fs.rm(tempDir, { force: true, recursive: true });
});

it('reports unsupported copied file formats instead of falling back to clipboard text', async () => {
  clipboard.availableFormats.mockReturnValue(['FileNameW']);
  clipboard.read.mockImplementation((format?: string) => (format === 'FileNameW' ? 'C:\\Users\\me\\Desktop\\archive.zip\u0000' : ''));
  clipboard.readText.mockReturnValue('C:\\Users\\me\\Desktop\\archive.zip');

  await expect(runClipboardImport()).rejects.toThrow('Clipboard file format is not supported');

  expect(runPreparedImport).not.toHaveBeenCalled();
});

it('imports plain clipboard text as an Inbox topic through the prepared import pipeline', async () => {
  clipboard.readText.mockReturnValue('# Clipboard topic\n\nBody');

  await expect(runClipboardImport()).resolves.toMatchObject({
    import_id: 'import-1',
    node_id: 'node-1',
    source_kind: 'text',
    source_name: 'Clipboard Text.txt'
  });

  expect(runPreparedImport).toHaveBeenCalledWith(
    expect.objectContaining({
      content: '# Clipboard topic\n\nBody',
      nodeTitle: 'Clipboard topic',
      sourceKind: 'text',
      sourceName: 'Clipboard Text.txt'
    })
  );
  expect(notifyManagedInboxUpdated).toHaveBeenCalledWith('import-1');
});

it('prefers clipboard HTML over plain text and converts it before import', async () => {
  clipboard.readHTML.mockReturnValue('<h1>Rich topic</h1><p><strong>Body</strong></p>');
  clipboard.readText.mockReturnValue('Rich topic\nBody');
  runPreparedImport.mockReturnValue(createImportRecord({ sourceKind: 'html', sourceName: 'Clipboard HTML.html' }));

  await expect(runClipboardImport()).resolves.toMatchObject({
    source_kind: 'html',
    source_name: 'Clipboard HTML.html'
  });

  expect(runPreparedImport).toHaveBeenCalledWith(
    expect.objectContaining({
      content: '# Rich topic\n\n**Body**',
      nodeTitle: 'Rich topic',
      sourceKind: 'html'
    })
  );
});

it('imports clipboard image bytes as a topic with an attachment markdown link', async () => {
  clipboardImage.isEmpty.mockReturnValue(false);
  runPreparedImport.mockReturnValue(createImportRecord({ sourceKind: 'markdown', sourceName: 'pasted-image.png' }));

  await expect(runClipboardImport()).resolves.toMatchObject({
    source_kind: 'markdown',
    source_name: 'pasted-image.png'
  });

  expect(runPreparedImport).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining('![Pasted image](asset://'),
      sourceKind: 'markdown',
      sourceName: 'pasted-image.png'
    })
  );
  expect(importImageAttachmentBytes).toHaveBeenCalledWith(
    expect.objectContaining({
      bytes: Buffer.from('png-bytes'),
      mimeType: 'image/png',
      nodeId: 'node-1',
      originalName: 'pasted-image.png'
    })
  );
});

it('writes a body blob when clipboard image attachment import falls back to an error body', async () => {
  clipboardImage.isEmpty.mockReturnValue(false);
  runPreparedImport.mockReturnValue(createImportRecord({ sourceKind: 'markdown', sourceName: 'pasted-image.png' }));
  importImageAttachmentBytes.mockResolvedValue({ message: 'Image import failed', status: 'error' });

  await runClipboardImport();

  const updateCall = databaseDriver.execute.mock.calls.find(([sql]) =>
    String(sql).includes('UPDATE nodes SET content = ?, body_blob_hash = ?')
  );
  expect(updateCall).toBeTruthy();
  expect(updateCall?.[1]).toEqual([
    '[Image import failed]',
    expect.stringMatching(/^[a-f0-9]{64}$/),
    '[Image import failed]',
    expect.stringMatching(/^20\d\d-\d\d-\d\dT/),
    'node-1'
  ]);
});
