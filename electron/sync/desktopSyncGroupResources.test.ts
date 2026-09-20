import { createHash } from 'node:crypto';

import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  needs: vi.fn(),
  hashFile: vi.fn(),
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
  openDatabaseConnection: runtime.openConnection,
  runWithDatabaseConnectionOwner: (fn: () => unknown) => fn()
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

vi.mock('./resourceAvailability.js', () => ({ hashResourceFile: runtime.hashFile }));
vi.mock('./desktopResourceProviders.js', () => ({
  requireResourceGroupKey: () => 'group-key',
  loadEligibleResourceMemberIds: () => ['provider'],
  loadDesktopResourceProviders: (target: object) => ({ providers: [{ ...target, deviceId: 'provider' }], eligibleDeviceIds: ['provider'] }),
  queryDesktopResourceAvailability: async (_peer: unknown, needs: Array<{ kind: string; id: string }>) => ({
    provider_device_id: 'provider', resources: needs.map((need) => ({ ...need, status: 'available', sha256: need.id, size_bytes: 1 }))
  })
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
    ...peer
  });

  expect(runtime.openConnection).toHaveBeenCalled();
  expect(runtime.transaction).toHaveBeenCalledTimes(1);
  expect(runtime.transactionRun).toHaveBeenCalledWith(
    'INSERT OR REPLACE INTO content_blob_data (hash, data) VALUES (?, ?)', [hash, body]
  );
});

it('keeps successes and attempts other files once when a request fails', async () => {
  const items = ['complete', 'interrupted', 'other'].map((id) => ({ attachmentId: sha256(`${id}-body`),
    contentHash: sha256(`${id}-body`), mimeType: 'image/png', storageKey: `${sha256(`${id}-body`)}.png` }));
  runtime.query.mockReset().mockResolvedValue([]);
  runtime.needs.mockResolvedValue({ needs: items, unreadableArticleIds: [] });
  const fetchMock = vi.fn(async (url: string) => url.includes(`attachment_id=${items[1]!.attachmentId}`)
    ? new Response('', { status: 404 })
    : new Response(url.includes(`attachment_id=${items[0]!.attachmentId}`) ? 'complete-body' : 'other-body'));
  vi.stubGlobal('fetch', fetchMock);
  const result = await downloadDesktopSyncGroupResources(peer, ['article']);
  expect(result.failedStorageKeys).toEqual([items[1]!.storageKey]);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(runtime.run).not.toHaveBeenCalled();
  expect(runtime.needs).toHaveBeenCalledWith(expect.any(Object), ['article']);
});

it('checks actual files and does not use stale library availability as a completion gate', async () => {
  const queryOne = vi.fn().mockReturnValue({ value: 0 });
  runtime.openConnection.mockReturnValue({ driver: { queryOne }, sqlite: {} });
  runtime.query.mockReset().mockResolvedValue([]);
  runtime.needs.mockResolvedValue({ needs: [{ attachmentId: 'owned', storageKey: 'owned.png', contentHash: 'owned-hash' }], unreadableArticleIds: [] });
  runtime.exists.mockReturnValue({ status: 'ready', filePath: 'owned-path' } as never);
  runtime.hashFile.mockResolvedValue('owned-hash');
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  expect(() => assertDesktopSyncGroupResourcesComplete()).not.toThrow();
  expect(queryOne.mock.calls.every(([sql]) => !sql.includes('attachment_blobs'))).toBe(true);
  await downloadDesktopSyncGroupResources(peer, ['article']);
  expect(runtime.exists).toHaveBeenCalledWith('owned.png');
  expect(fetchMock).not.toHaveBeenCalled();
});

const peer = { endpoint_url: 'http://provider', group_id: 'group-1', local_device_id: 'authorization-desktop-c',
  peer_device_id: 'provider', peer_device_name: 'Provider', peer_platform: 'darwin' };
function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

it('keeps verified bodies while rejecting missing, corrupt, and duplicate multipart entries', async () => {
  const contents = ['good', 'corrupt', 'missing', 'duplicate'];
  const rows = contents.map((text) => ({ hash: sha256(text), stored_sha256: sha256(text), stored_size_bytes: text.length }));
  runtime.query.mockReset().mockResolvedValue(rows);
  const part = (index: number, body: string) => Buffer.from(`--mixed\r\nContent-Type: text/plain\r\nContent-Length: ${body.length}\r\nX-Blob-Hash: ${rows[index]!.hash}\r\n\r\n${body}\r\n`);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.concat([
    part(0, 'good'), part(1, 'damaged'), part(3, 'duplicate'), part(3, 'duplicate'), Buffer.from('--mixed--\r\n')
  ]), { headers: { 'X-Foliole-Original-Content-Type': 'multipart/mixed; boundary=mixed' } })));
  const result = await downloadDesktopSyncGroupResources(peer);
  expect(runtime.transaction).toHaveBeenCalledTimes(1);
  expect(result.resourceResults[0]?.ready).toEqual([`content_blob:${rows[0]!.hash}`]);
  expect(result.resourceResults[0]?.issues.map((issue) => issue.error)).toEqual([
    'checksum_mismatch', 'missing_file', 'protocol_error'
  ]);
});
