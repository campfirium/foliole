import { createHash } from 'node:crypto';

import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  execute: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  openConnection: vi.fn(),
  queryAll: vi.fn(),
  rename: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    promises: { ...actual.promises, mkdir: runtime.mkdir, rename: runtime.rename, writeFile: runtime.writeFile }
  };
});
vi.mock('../attachments/resourceResolver.js', () => ({
  resolveAttachmentStoragePath: (id: string) => `${process.cwd()}/.tmp/test-attachments/${id}`
}));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: runtime.openConnection
}));

import { downloadDesktopSyncGroupResources } from './desktopSyncGroupResources.js';

beforeEach(() => {
  vi.clearAllMocks();
  runtime.openConnection.mockReturnValue({
    driver: {
      execute: runtime.execute,
      queryAll: runtime.queryAll,
      transaction: (execute: () => void) => execute()
    }
  });
  runtime.queryAll
    .mockReturnValueOnce([])
    .mockReturnValueOnce([
      { attachment_id: 'complete', content_hash: sha256('complete-body') },
      { attachment_id: 'interrupted', content_hash: sha256('interrupted-body') }
    ]);
});

it('persists a content body batch through the transaction owner that enumerated it', async () => {
  const body = Buffer.from('complete-content-body');
  const hash = sha256(body);
  const boundary = 'content-owner-boundary';
  runtime.queryAll
    .mockReset()
    .mockReturnValueOnce([{ hash, stored_sha256: hash, stored_size_bytes: body.length }])
    .mockReturnValueOnce([]);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: text/plain\r\nContent-Length: ${body.length}\r\nX-Blob-Hash: ${hash}\r\n\r\n`),
    body,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]), { headers: { 'Content-Type': `multipart/mixed; boundary=${boundary}` } })));

  await downloadDesktopSyncGroupResources({
    endpoint_url: 'http://provider', group_id: 'group-1', local_device_id: 'desktop-c', secret: 'secret'
  });

  expect(runtime.openConnection).toHaveBeenCalledTimes(1);
  expect(runtime.execute).toHaveBeenCalledWith(
    'INSERT OR REPLACE INTO content_blob_data (hash, data) VALUES (?, ?)', [hash, body]
  );
});

it('keeps a completed attachment when another concurrent request interrupts the sync', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (
    url.includes('attachment_id=complete')
      ? new Response('complete-body')
      : new Response('', { status: 503 })
  )));

  await expect(downloadDesktopSyncGroupResources({
    endpoint_url: 'http://provider', group_id: 'group-1', local_device_id: 'desktop-c', secret: 'secret'
  })).rejects.toThrow('sync_resource_http_503');

  await vi.waitFor(() => expect(runtime.execute).toHaveBeenCalledWith(
    expect.stringContaining("UPDATE attachment_blobs SET availability = 'cached'"),
    expect.arrayContaining(['complete'])
  ));
  expect(runtime.execute).not.toHaveBeenCalledWith(
    expect.any(String), expect.arrayContaining(['interrupted'])
  );
});

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}
