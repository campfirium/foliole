import { createHash } from 'node:crypto';

import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  openConnection: vi.fn(),
  query: vi.fn(),
  rename: vi.fn().mockResolvedValue(undefined),
  run: vi.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 0 }),
  transaction: vi.fn(),
  transactionRun: vi.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 0 }),
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
vi.mock('../database/betterSqliteDbPort.js', () => ({
  createBetterSqliteDbPort: () => ({
    query: runtime.query,
    run: runtime.run,
    transaction: runtime.transaction
  })
}));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: runtime.openConnection
}));
vi.mock('./workgroupKeyStore.js', () => ({
  loadDesktopWorkgroupKey: () => ({ group_key: 'group-key' })
}));
vi.mock('./desktopSyncGroupHttp.js', () => ({
  createDesktopSyncGroupSignedHeaders: () => ({}),
  createDesktopWorkgroupPost: ({ body }: { body: string }) => ({ body, headers: {} }),
  readDesktopWorkgroupResponse: async ({ response }: { response: Response }) => {
    if (!response.ok) throw new Error(`sync_resource_http_${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
}));

import {
  assertDesktopSyncGroupResourcesComplete, downloadDesktopSyncGroupResources
} from './desktopSyncGroupResources.js';

beforeEach(() => {
  vi.clearAllMocks();
  runtime.openConnection.mockReturnValue({ sqlite: {} });
  runtime.transaction.mockImplementation(async (execute: (tx: { run: typeof runtime.transactionRun }) => Promise<void>) => {
    await execute({ run: runtime.transactionRun });
  });
  runtime.query
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
  runtime.query
    .mockReset()
    .mockReturnValueOnce([{ hash, stored_sha256: hash, stored_size_bytes: body.length }])
    .mockReturnValueOnce([]);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: text/plain\r\nContent-Length: ${body.length}\r\nX-Blob-Hash: ${hash}\r\n\r\n`),
    body,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]), { headers: { 'X-Foliole-Original-Content-Type': `multipart/mixed; boundary=${boundary}` } })));

  await downloadDesktopSyncGroupResources({
    endpoint_url: 'http://provider', group_id: 'group-1', local_device_id: 'authorization-desktop-c'
  });

  expect(runtime.openConnection).toHaveBeenCalledTimes(1);
  expect(runtime.transaction).toHaveBeenCalledTimes(1);
  expect(runtime.transactionRun).toHaveBeenCalledWith(
    'INSERT OR REPLACE INTO content_blob_data (hash, data) VALUES (?, ?)', [hash, body]
  );
});

it('keeps a completed attachment when another concurrent request interrupts the sync', async () => {
  runtime.query.mockReset().mockReturnValueOnce([]).mockReturnValueOnce([
    { attachment_id: 'complete', content_hash: sha256('complete-body') },
    { attachment_id: 'interrupted', content_hash: sha256('interrupted-body') }
  ]);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (
    url.includes('attachment_id=complete')
      ? new Response('complete-body')
      : new Response('', { status: 503 })
  )));

  await expect(downloadDesktopSyncGroupResources({
    endpoint_url: 'http://provider', group_id: 'group-1', local_device_id: 'authorization-desktop-c'
  })).rejects.toThrow('sync_resource_http_503');

  await vi.waitFor(() => expect(runtime.run).toHaveBeenCalledWith(
    expect.stringContaining("UPDATE attachment_blobs SET availability = 'cached'"),
    expect.arrayContaining(['complete'])
  ));
  expect(runtime.run).not.toHaveBeenCalledWith(
    expect.any(String), expect.arrayContaining(['interrupted'])
  );
});

it('treats locally owned and downloaded attachment resources as complete', async () => {
  const queryOne = vi.fn().mockReturnValue({ value: 0 });
  runtime.openConnection.mockReturnValue({ driver: { queryOne }, sqlite: {} });
  runtime.query.mockReset().mockReturnValueOnce([]).mockReturnValueOnce([]);
  expect(() => assertDesktopSyncGroupResourcesComplete()).not.toThrow();
  expect(queryOne).toHaveBeenCalledWith(expect.stringContaining(
    "availability NOT IN ('cached', 'local')"
  ));
  await downloadDesktopSyncGroupResources({
    endpoint_url: 'http://provider', group_id: 'group-1', local_device_id: 'authorization-desktop-c'
  });
  expect(runtime.query.mock.calls[1]?.[0]).toContain("availability NOT IN ('cached', 'local')");
});

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}
