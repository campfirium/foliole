import { createHash } from 'node:crypto';

import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  execute: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
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
  openDatabaseConnection: () => ({
    driver: {
      execute: runtime.execute,
      queryAll: runtime.queryAll,
      transaction: (execute: () => void) => execute()
    }
  })
}));

import { downloadDesktopSyncGroupResources } from './desktopSyncGroupResources.js';

beforeEach(() => {
  vi.clearAllMocks();
  runtime.queryAll
    .mockReturnValueOnce([])
    .mockReturnValueOnce([
      { attachment_id: 'complete', content_hash: sha256('complete-body') },
      { attachment_id: 'interrupted', content_hash: sha256('interrupted-body') }
    ]);
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

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
