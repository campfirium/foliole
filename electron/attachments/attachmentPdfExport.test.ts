// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { exportNodePdf } from './attachmentPdfExport.js';

const { showSaveDialog, listNodeAttachments, loadAttachmentResourceDescription, loadNodeSourceDetails, resolveAttachmentFile } = vi.hoisted(() => ({
  showSaveDialog: vi.fn(),
  listNodeAttachments: vi.fn(),
  loadAttachmentResourceDescription: vi.fn(),
  loadNodeSourceDetails: vi.fn(),
  resolveAttachmentFile: vi.fn()
}));

vi.mock('electron', () => ({ dialog: { showSaveDialog } }));
vi.mock('../database/attachments.js', () => ({ listNodeAttachments }));
vi.mock('../database/attachmentResourceDescription.js', () => ({ loadAttachmentResourceDescription }));
vi.mock('../database/nodeSourceDetails.js', () => ({ loadNodeSourceDetails }));
vi.mock('./resourceResolver.js', () => ({ resolveAttachmentFile }));

afterEach(() => vi.clearAllMocks());

it('saves the linked PDF bytes with its original filename', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-pdf-export-'));
  const destination = path.join(directory, 'Paper.pdf');
  const bytes = Buffer.from('%PDF-1.7\nexample');
  listNodeAttachments.mockReturnValue([{
    attachmentId: 'pdf-hash', role: 'reference',
    attachment: { mimeType: 'application/pdf', originalName: 'Shared.pdf' }
  }]);
  loadAttachmentResourceDescription.mockReturnValue({ mimeType: 'application/pdf', storageKey: 'pdf-hash.pdf' });
  loadNodeSourceDetails.mockReturnValue({ importSource: { source_name: 'Paper.pdf' } });
  resolveAttachmentFile.mockReturnValue({ status: 'ready', filePath: '/library/Assets/pdf-hash.pdf', bytes });
  showSaveDialog.mockResolvedValue({ canceled: false, filePath: destination });

  try {
    await expect(exportNodePdf('topic-1', null)).resolves.toEqual({ status: 'saved', path: destination });
    expect(showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'Paper.pdf' }));
    expect(await fs.readFile(destination)).toEqual(bytes);
    expect(listNodeAttachments).toHaveBeenCalledWith('topic-1');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

it('does not offer an unrelated attachment for export', async () => {
  listNodeAttachments.mockReturnValue([{
    attachmentId: 'image-hash', role: 'image', attachment: { mimeType: 'image/png', originalName: 'cover.png' }
  }]);
  await expect(exportNodePdf('topic-1', null)).resolves.toEqual({ status: 'not_found', path: null });
  expect(showSaveDialog).not.toHaveBeenCalled();
});
