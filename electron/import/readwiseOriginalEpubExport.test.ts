// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  fetchRoot: vi.fn(),
  loadTarget: vi.fn(),
  runtimeStatus: vi.fn(),
  showSaveDialog: vi.fn()
}));

vi.mock('electron', () => ({ dialog: { showSaveDialog: mocks.showSaveDialog } }));
vi.mock('./readwiseOriginalEpubTarget.js', () => ({
  loadReadwiseOriginalEpubTarget: mocks.loadTarget,
  readReadwiseOriginalEpubRuntimeStatus: mocks.runtimeStatus
}));
vi.mock('./readwiseOriginalEpubRemote.js', () => ({ fetchOriginalEpubRemoteRoot: mocks.fetchRoot }));
vi.mock('./readwiseOriginalFileDownload.js', () => ({ downloadReadwiseOriginalFile: mocks.download }));

import { exportReadwiseOriginalEpub } from './readwiseOriginalEpubExport.js';

let directory: string;

beforeEach(async () => {
  vi.clearAllMocks();
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-epub-export-'));
  mocks.loadTarget.mockReturnValue({ documentId: 'reader-book', nodeId: 'topic-1', title: 'Book' });
  mocks.runtimeStatus.mockReturnValue('ready');
  mocks.fetchRoot.mockResolvedValue({ rawSourceUrl: 'https://s3.amazonaws.com/book' });
  mocks.download.mockResolvedValue(Uint8Array.from([80, 75, 3, 4]));
});

afterEach(async () => { await fs.rm(directory, { force: true, recursive: true }); });

it('downloads the selected Readwise book only after the save destination is chosen', async () => {
  const destination = path.join(directory, 'Book.epub');
  mocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: destination });
  await expect(exportReadwiseOriginalEpub('topic-1', null)).resolves.toEqual({
    node_id: 'topic-1', path: destination, status: 'saved'
  });
  expect(mocks.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'Book.epub' }));
  expect(mocks.fetchRoot).toHaveBeenCalledWith({ documentId: 'reader-book' });
  expect(mocks.download).toHaveBeenCalledWith('https://s3.amazonaws.com/book', 'epub');
  expect(await fs.readFile(destination)).toEqual(Buffer.from([80, 75, 3, 4]));
});

it('does not call Readwise when the save dialog is cancelled', async () => {
  mocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });
  await expect(exportReadwiseOriginalEpub('topic-1', null)).resolves.toMatchObject({ status: 'cancelled' });
  expect(mocks.fetchRoot).not.toHaveBeenCalled();
  expect(mocks.download).not.toHaveBeenCalled();
});

it('keeps an existing destination intact if the download fails', async () => {
  const destination = path.join(directory, 'Book.epub');
  await fs.writeFile(destination, 'previous');
  mocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: destination });
  mocks.download.mockRejectedValue(new Error('original_file_http_403'));
  await expect(exportReadwiseOriginalEpub('topic-1', null)).resolves.toMatchObject({ status: 'failed' });
  expect(await fs.readFile(destination, 'utf8')).toBe('previous');
  expect(await fs.readdir(directory)).toEqual(['Book.epub']);
});
