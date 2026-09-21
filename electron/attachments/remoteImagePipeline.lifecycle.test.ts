// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { download, readCache, writeCache } = vi.hoisted(() => ({
  download: vi.fn(), readCache: vi.fn(), writeCache: vi.fn()
}));
vi.mock('./remoteImageDownload.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('./remoteImageDownload.js')>(),
  downloadRemoteImageBytes: download
}));
vi.mock('./remoteImageCache.js', () => ({
  readRemoteImageCache: readCache, writeRemoteImageCache: writeCache,
  resetRemoteImageCacheForTests: vi.fn(), configureRemoteImageCacheRoot: vi.fn()
}));

import type { RemoteImageFetchResult } from './remoteImageDownload.js';
import { fetchRemoteImageMetadata, fetchRemoteImageResource, resetRemoteImagePipelineForTests } from './remoteImagePipeline.js';

const URL = 'https://example.com/image.png';
const ready: RemoteImageFetchResult = {
  status: 'ready', strategy: 'direct',
  resource: {
    bytes: new Uint8Array([1]), cacheKey: URL, sourceUrl: URL,
    intrinsicSize: { width: 1, height: 1 }, mimeType: 'image/png', originalName: 'image.png'
  }
};
const failure: RemoteImageFetchResult = {
  status: 'error', error: {
    status: 'error', error_code: 'download_failed', message: 'Failed', source_path: URL
  }
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRemoteImagePipelineForTests();
  readCache.mockResolvedValue(null);
  writeCache.mockResolvedValue(undefined);
});

it('shares the active download through cache writes, then retries a disk miss', async () => {
  const pending = deferred<RemoteImageFetchResult>();
  const write = deferred<void>();
  download.mockReturnValueOnce(pending.promise).mockResolvedValue(ready);
  writeCache.mockReturnValueOnce(write.promise);
  const first = fetchRemoteImageResource(URL);
  await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
  const second = fetchRemoteImageResource(URL);
  pending.resolve(ready);
  await vi.waitFor(() => expect(writeCache).toHaveBeenCalledTimes(1));
  const third = fetchRemoteImageResource(URL);
  write.resolve();
  await expect(Promise.all([first, second, third])).resolves.toEqual([ready, ready, ready]);
  expect(download).toHaveBeenCalledTimes(1);
  await expect(fetchRemoteImageResource(URL)).resolves.toEqual(ready);
  expect(download).toHaveBeenCalledTimes(2);
});

it('uses the disk cache after completion without downloading again', async () => {
  download.mockResolvedValue(ready);
  await fetchRemoteImageResource(URL);
  readCache.mockResolvedValue(ready.resource);
  await expect(fetchRemoteImageResource(URL)).resolves.toEqual(ready);
  await expect(fetchRemoteImageMetadata(URL)).resolves.toEqual({ width: 1, height: 1 });
  expect(download).toHaveBeenCalledTimes(1);
});

it.each([ready, failure])('older $status completion preserves a refreshed active request', async (result) => {
  const older = deferred<RemoteImageFetchResult>();
  const newer = deferred<RemoteImageFetchResult>();
  download.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  const first = fetchRemoteImageResource(URL);
  await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
  const refreshed = fetchRemoteImageResource(URL, { refresh: true });
  await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(2));
  older.resolve(result);
  await first;
  const joined = fetchRemoteImageResource(URL, { bypassFailureCache: true });
  newer.resolve(ready);
  await expect(Promise.all([refreshed, joined])).resolves.toEqual([ready, ready]);
  expect(download).toHaveBeenCalledTimes(2);
});

it('retains failure caching but allows an explicit retry after failure', async () => {
  download.mockResolvedValueOnce(failure).mockResolvedValue(ready);
  await expect(fetchRemoteImageResource(URL)).resolves.toEqual(failure);
  await expect(fetchRemoteImageResource(URL)).resolves.toEqual(failure);
  expect(download).toHaveBeenCalledTimes(1);
  await expect(fetchRemoteImageResource(URL, { bypassFailureCache: true })).resolves.toEqual(ready);
  expect(download).toHaveBeenCalledTimes(2);
});

it('releases a rejected download and settles its metadata waiters', async () => {
  const pending = deferred<RemoteImageFetchResult>();
  download.mockReturnValueOnce(pending.promise).mockResolvedValue(ready);
  const resource = fetchRemoteImageResource(URL);
  const rejected = expect(resource).rejects.toThrow('unexpected');
  const metadata = fetchRemoteImageMetadata(URL);
  await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
  pending.reject(new Error('unexpected'));
  await rejected;
  await expect(metadata).resolves.toBeNull();
  await expect(fetchRemoteImageResource(URL)).resolves.toEqual(ready);
  expect(download).toHaveBeenCalledTimes(2);
});
