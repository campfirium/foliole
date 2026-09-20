import { createHash } from 'node:crypto';

import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  needs: vi.fn(),
  exists: vi.fn(() => ({ status: 'missing_file' })),
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
vi.mock('../../lib/core/sync/articleAttachmentNeeds.js', () => ({ loadArticleAttachmentNeeds: runtime.needs }));
vi.mock('../attachments/resourceResolver.js', () => ({
  resolveAttachmentFile: runtime.exists,
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
  runtime.needs.mockResolvedValue({ needs: [], unreadableArticleIds: [] });
  runtime.exists.mockReturnValue({ status: 'missing_file' });
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

it('keeps successes and attempts other files once when a request fails', async () => {
  const items = ['complete', 'interrupted', 'other'].map((id) => ({ attachmentId: id,
    contentHash: sha256(`${id}-body`), mimeType: 'image/png', storageKey: `${sha256(`${id}-body`)}.png` }));
  runtime.query.mockReset().mockResolvedValue([]);
  runtime.needs.mockResolvedValue({ needs: items, unreadableArticleIds: [] });
  const fetchMock = vi.fn(async (url: string) => url.includes('attachment_id=interrupted')
    ? new Response('', { status: 404 })
    : new Response(url.includes('attachment_id=complete') ? 'complete-body' : 'other-body'));
  vi.stubGlobal('fetch', fetchMock);
  const result = await downloadDesktopSyncGroupResources(peer, ['article']);
  expect(result.failedStorageKeys).toEqual([items[1]!.storageKey]);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(runtime.run).toHaveBeenCalledTimes(2);
  expect(runtime.run.mock.calls.map(([, params]) => params.at(-1))).toEqual(expect.arrayContaining(['complete', 'other']));
  expect(runtime.needs).toHaveBeenCalledWith(expect.any(Object), ['article']);
});

it('checks actual files and does not use stale library availability as a completion gate', async () => {
  const queryOne = vi.fn().mockReturnValue({ value: 0 });
  runtime.openConnection.mockReturnValue({ driver: { queryOne }, sqlite: {} });
  runtime.query.mockReset().mockResolvedValue([]);
  runtime.needs.mockResolvedValue({ needs: [{ attachmentId: 'owned', storageKey: 'owned.png' }], unreadableArticleIds: [] });
  runtime.exists.mockReturnValue({ status: 'ready' });
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  expect(() => assertDesktopSyncGroupResourcesComplete()).not.toThrow();
  expect(queryOne.mock.calls.every(([sql]) => !sql.includes('attachment_blobs'))).toBe(true);
  await downloadDesktopSyncGroupResources(peer, ['article']);
  expect(runtime.exists).toHaveBeenCalledWith('owned.png');
  expect(fetchMock).not.toHaveBeenCalled();
});

const peer = { endpoint_url: 'http://provider', group_id: 'group-1', local_device_id: 'authorization-desktop-c' };
function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}
