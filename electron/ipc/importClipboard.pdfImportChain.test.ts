// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-clipboard-pdf-import-tests';

const { clipboard } = vi.hoisted(() => ({
  clipboard: {
    availableFormats: vi.fn((): string[] => []),
    read: vi.fn((format?: string) => {
      void format;
      return '';
    }),
    readBuffer: vi.fn(() => Buffer.alloc(0)),
    readHTML: vi.fn(() => ''),
    readImage: vi.fn(() => ({ isEmpty: () => true, toPNG: () => Buffer.alloc(0) })),
    readText: vi.fn(() => '')
  }
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  },
  clipboard,
  shell: {
    trashItem: vi.fn(async (filePath: string) => {
      await fs.rm(filePath, { force: true, recursive: true });
    })
  }
}));

vi.mock('../clipboardAccess.js', () => ({
  electronClipboardAccess: clipboard,
  readElectronClipboardTextType: vi.fn((type: string) => clipboard.read(type))
}));

vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('../database/pdfIndexing.js', async () => ({
  ...await vi.importActual<typeof import('../database/pdfIndexing.js')>('../database/pdfIndexing.js'),
  enqueuePdfAttachmentIndexing: vi.fn()
}));

import { buildAttachmentAssetUrl } from '../attachments/attachmentAssetUrl.js';
import { resolveAttachmentFile } from '../attachments/resourceResolver.js';
import { listNodeAttachments } from '../database/attachments.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { runClipboardImport } from './importClipboard.js';
import { toNativeNodeSourceDetails } from './nodeSourceDetailsPayload.js';

let tempRoot = '';

beforeEach(async () => {
  vi.clearAllMocks();
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-clipboard-pdf-import-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
});

async function writePdf(fileName: string) {
  const filePath = path.join(tempRoot, fileName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(`%PDF-1.4\n% ${fileName}\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n`));
  return filePath;
}

it('imports a copied PDF through the same linked reader chain as manual file import', async () => {
  const filePath = await writePdf(path.join('manual-import', '渐进阅读报告.pdf'));
  clipboard.availableFormats.mockReturnValue(['FileNameW']);
  clipboard.readBuffer.mockImplementation((format?: string) =>
    format === 'FileNameW' ? Buffer.from(`${filePath}\u0000`, 'utf16le') : Buffer.alloc(0)
  );

  const imported = await runClipboardImport({ title_strategy: 'file_name' });

  expect(imported).toEqual(expect.objectContaining({ result_status: 'imported', source_kind: 'pdf' }));
  const pdfAttachment = listNodeAttachments(imported?.node_id as string)[0];
  const resolvedAttachment = resolveAttachmentFile(pdfAttachment?.attachmentId as string);
  expect(resolvedAttachment.status).toBe('ready');
  expect(pdfAttachment).toEqual(
    expect.objectContaining({
      role: 'reference',
      attachment: expect.objectContaining({ mimeType: 'application/pdf', originalName: '渐进阅读报告.pdf' })
    })
  );
  expect(toNativeNodeSourceDetails(imported?.node_id as string)?.import_source).toEqual(
    expect.objectContaining({
      source_kind: 'pdf',
      source_locator: buildAttachmentAssetUrl(pdfAttachment?.attachmentId as string),
      source_name: '渐进阅读报告.pdf'
    })
  );
});
