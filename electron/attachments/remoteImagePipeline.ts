import type {
  NativeImportLocalImageAttachmentResult,
  NativeImportRemoteImageAttachmentArgs
} from '../../lib/platform/nativeStorageContract.js';

import { importImageAttachmentBytes } from './importImageAttachmentBytes.js';
import {
  configureRemoteImageCacheRoot,
  readRemoteImageCache,
  resetRemoteImageCacheForTests,
  writeRemoteImageCache
} from './remoteImageCache.js';
import { recordRemoteImageDiagnostic } from './remoteImageDiagnostics.js';
import {
  createRemoteImageDownloadError,
  downloadRemoteImageBytes,
  type RemoteImageErrorResult,
  resolveImageHost,
  resolveRemoteImageCacheKey,
  resolveRemoteImageFailureCacheMs,
  resolveRemoteImageFetchKey,
  type RemoteImageFetchOptions,
  type RemoteImageFetchResult,
  type RemoteImageFetchTransport
} from './remoteImageDownload.js';
import { learnRemoteImageSourceOrigin } from './remoteImageLearnedSources.js';
import { resolveRemoteImageTransportName } from './remoteImageTransport.js';

const fetchByCacheKey = new Map<string, Promise<RemoteImageFetchResult>>();
const importByNodeAndCacheKey = new Map<string, Promise<NativeImportLocalImageAttachmentResult>>();
const failureByCacheKey = new Map<string, { error: RemoteImageErrorResult; expiresAt: number }>();
let fetchTransportForTests: RemoteImageFetchTransport | null = null;

function readFailureCache(fetchKey: string) {
  const cached = failureByCacheKey.get(fetchKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.error;
  }
  failureByCacheKey.delete(fetchKey);
  return null;
}

async function storeRemoteImageFetchResult(
  sourceUrl: string,
  sourceOrigin: string | null,
  result: RemoteImageFetchResult
) {
  if (result.status === 'error') {
    return result;
  }
  await writeRemoteImageCache(result.resource).catch(() => undefined);
  if (result.strategy === 'source-origin') {
    learnRemoteImageSourceOrigin(sourceUrl, sourceOrigin);
  }
  return result;
}

export function resolveRemoteImageSourceCacheKey(sourceUrl: string) {
  return resolveRemoteImageCacheKey(sourceUrl);
}

export function resetRemoteImagePipelineForTests() {
  fetchByCacheKey.clear();
  importByNodeAndCacheKey.clear();
  failureByCacheKey.clear();
  fetchTransportForTests = null;
  resetRemoteImageCacheForTests();
}

export function configureRemoteImagePipelineCacheRoot(root: string | null) {
  configureRemoteImageCacheRoot(root);
}

export function configureRemoteImageFetchTransportForTests(transport: RemoteImageFetchTransport | null) {
  fetchTransportForTests = transport;
}

export async function fetchRemoteImageResource(
  sourceUrl: string,
  options: RemoteImageFetchOptions = {}
): Promise<RemoteImageFetchResult> {
  const cacheKey = resolveRemoteImageCacheKey(sourceUrl);
  if (!cacheKey) {
    return { status: 'error', error: createRemoteImageDownloadError('The remote image URL is not supported.', sourceUrl) };
  }
  const cachedResource = await readRemoteImageCache(cacheKey);
  if (cachedResource) {
    recordRemoteImageDiagnostic({
      attempt: 0,
      bytes: cachedResource.bytes.length,
      cache: 'disk',
      contentType: cachedResource.mimeType,
      elapsedMs: 0,
      errorCode: null,
      imageHost: resolveImageHost(sourceUrl),
      sourceOrigin: options.sourceOrigin ?? null,
      status: 200,
      strategy: options.sourceOrigin ? 'source-origin' : 'direct',
      transport: resolveRemoteImageTransportName(fetchTransportForTests)
    });
    return { status: 'ready', resource: cachedResource, strategy: 'direct' };
  }
  const fetchKey = resolveRemoteImageFetchKey(cacheKey, options.sourceOrigin ?? null);
  const cachedError = options.bypassFailureCache ? null : readFailureCache(fetchKey);
  if (cachedError) {
    recordRemoteImageDiagnostic({
      attempt: 0,
      bytes: null,
      cache: 'failure',
      contentType: null,
      elapsedMs: 0,
      errorCode: cachedError.error_code,
      imageHost: resolveImageHost(sourceUrl),
      sourceOrigin: options.sourceOrigin ?? null,
      status: null,
      strategy: options.sourceOrigin ? 'source-origin' : 'direct',
      transport: resolveRemoteImageTransportName(fetchTransportForTests)
    });
    return { status: 'error', error: cachedError };
  }
  if (!fetchByCacheKey.has(fetchKey)) {
    const promise = downloadRemoteImageBytes(sourceUrl.trim(), cacheKey, options.sourceOrigin ?? null, fetchTransportForTests).then(async (result) => {
      if (result.status === 'error') {
        fetchByCacheKey.delete(fetchKey);
        failureByCacheKey.set(fetchKey, {
          error: result.error,
          expiresAt: Date.now() + resolveRemoteImageFailureCacheMs(result.error)
        });
        return result;
      }
      return storeRemoteImageFetchResult(sourceUrl, options.sourceOrigin ?? null, result);
    });
    fetchByCacheKey.set(fetchKey, promise);
  }
  return fetchByCacheKey.get(fetchKey)!;
}

export async function importRemoteImageAttachment(
  args: NativeImportRemoteImageAttachmentArgs
): Promise<NativeImportLocalImageAttachmentResult> {
  const normalizedNodeId = args.nodeId.trim();
  const fetchResult = await fetchRemoteImageResource(args.sourceUrl);
  if (fetchResult.status === 'error') {
    return fetchResult.error;
  }

  const importKey = `${normalizedNodeId}\u0000${fetchResult.resource.cacheKey}`;
  if (!importByNodeAndCacheKey.has(importKey)) {
    const promise = importImageAttachmentBytes({
      bytes: fetchResult.resource.bytes,
      errorSource: fetchResult.resource.sourceUrl,
      mimeType: fetchResult.resource.mimeType,
      nodeId: normalizedNodeId,
      originalName: fetchResult.resource.originalName
    });
    importByNodeAndCacheKey.set(importKey, promise);
  }
  return importByNodeAndCacheKey.get(importKey)!;
}
