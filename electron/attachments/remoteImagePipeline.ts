import type {
  NativeImportLocalImageAttachmentResult,
  NativeImportRemoteImageAttachmentArgs
} from '../../lib/platform/nativeStorageContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { registerNodeImageSources } from '../database/nodeImageSources.js';
import type { ImageIntrinsicSize } from '../import/imageIntrinsicSize.js';

import { importImageAttachmentBytes } from './importImageAttachmentBytes.js';
import {
  configureRemoteImageCacheRoot,
  readRemoteImageCache,
  resetRemoteImageCacheForTests,
  writeRemoteImageCache
} from './remoteImageCache.js';
import { recordRemoteImageDiagnostic } from './remoteImageDiagnostics.js';
import {
  createRemoteImagePolicyError,
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

interface RemoteImageFetchLifecycle {
  metadataReady: Promise<ImageIntrinsicSize | null>;
  resourceReady: Promise<RemoteImageFetchResult>;
}

const fetchByCacheKey = new Map<string, RemoteImageFetchLifecycle>();
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
    await runWithDatabaseConnectionOwner(() => learnRemoteImageSourceOrigin(sourceUrl, sourceOrigin));
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
    return { status: 'error', error: createRemoteImagePolicyError('The remote image URL is not supported.', sourceUrl) };
  }
  const cachedResource = options.refresh ? null : await readCachedRemoteImageResource(sourceUrl, cacheKey, options);
  if (cachedResource) return cachedResource;
  const fetchKey = resolveRemoteImageFetchKey(cacheKey, options.sourceOrigin ?? null);
  if (options.refresh) fetchByCacheKey.delete(fetchKey);
  const cachedError = readCachedRemoteImageFailure(sourceUrl, fetchKey, options);
  if (cachedError) return cachedError;
  if (!fetchByCacheKey.has(fetchKey)) {
    fetchByCacheKey.set(fetchKey, createRemoteImageFetchLifecycle(sourceUrl, cacheKey, fetchKey, options));
  }
  return fetchByCacheKey.get(fetchKey)!.resourceReady;
}

export async function fetchRemoteImageMetadata(
  sourceUrl: string,
  options: RemoteImageFetchOptions = {}
): Promise<ImageIntrinsicSize | null> {
  const cacheKey = resolveRemoteImageCacheKey(sourceUrl);
  if (!cacheKey) return null;
  const cachedResource = await readRemoteImageCache(cacheKey);
  if (cachedResource) return cachedResource.intrinsicSize;
  const fetchKey = resolveRemoteImageFetchKey(cacheKey, options.sourceOrigin ?? null);
  if (readCachedRemoteImageFailure(sourceUrl, fetchKey, options)) return null;
  if (!fetchByCacheKey.has(fetchKey)) {
    fetchByCacheKey.set(fetchKey, createRemoteImageFetchLifecycle(sourceUrl, cacheKey, fetchKey, options));
  }
  return fetchByCacheKey.get(fetchKey)!.metadataReady;
}

async function readCachedRemoteImageResource(
  sourceUrl: string,
  cacheKey: string,
  options: RemoteImageFetchOptions
): Promise<RemoteImageFetchResult | null> {
  const cachedResource = await readRemoteImageCache(cacheKey);
  if (!cachedResource) return null;
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

function readCachedRemoteImageFailure(
  sourceUrl: string,
  fetchKey: string,
  options: RemoteImageFetchOptions
): RemoteImageFetchResult | null {
  const cachedError = options.bypassFailureCache || options.refresh ? null : readFailureCache(fetchKey);
  if (!cachedError) return null;
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

function createRemoteImageFetchLifecycle(
  sourceUrl: string,
  cacheKey: string,
  fetchKey: string,
  options: RemoteImageFetchOptions
): RemoteImageFetchLifecycle {
  let resolveMetadata!: (size: ImageIntrinsicSize | null) => void;
  let didResolveMetadata = false;
  const metadataReady = new Promise<ImageIntrinsicSize | null>((resolve) => { resolveMetadata = resolve; });
  const finishMetadata = (size: ImageIntrinsicSize | null) => {
    if (didResolveMetadata) return;
    didResolveMetadata = true;
    resolveMetadata(size);
  };
  const resourceReady = downloadRemoteImageBytes(
    sourceUrl.trim(),
    cacheKey,
    options.sourceOrigin ?? null,
    fetchTransportForTests,
    finishMetadata
  ).then(async (result) => {
    finishMetadata(result.status === 'ready' ? result.resource.intrinsicSize : null);
    if (result.status === 'error') {
      failureByCacheKey.set(fetchKey, {
        error: result.error,
        expiresAt: Date.now() + resolveRemoteImageFailureCacheMs(result.error)
      });
      return result;
    }
    return storeRemoteImageFetchResult(sourceUrl, options.sourceOrigin ?? null, result);
  }).finally(() => {
    finishMetadata(null);
    if (fetchByCacheKey.get(fetchKey)?.resourceReady === resourceReady) {
      fetchByCacheKey.delete(fetchKey);
    }
  });
  return { metadataReady, resourceReady };
}

export async function importRemoteImageAttachment(
  args: NativeImportRemoteImageAttachmentArgs
): Promise<NativeImportLocalImageAttachmentResult> {
  const normalizedNodeId = args.nodeId.trim();
  const fetchResult = await fetchRemoteImageResource(args.sourceUrl, { sourceOrigin: args.sourceOrigin ?? null, refresh: args.refresh ?? false });
  if (fetchResult.status === 'error') {
    return fetchResult.error;
  }

  const importKey = `${normalizedNodeId}\u0000${fetchResult.resource.cacheKey}`;
  if (args.refresh) importByNodeAndCacheKey.delete(importKey);
  if (!importByNodeAndCacheKey.has(importKey)) {
    const promise = runWithDatabaseConnectionOwner(async () => {
      const result = await importImageAttachmentBytes({
        bytes: fetchResult.resource.bytes,
        errorSource: fetchResult.resource.sourceUrl,
        mimeType: fetchResult.resource.mimeType,
        nodeId: normalizedNodeId,
        originalName: fetchResult.resource.originalName
      });
      if (result.status === 'imported') {
        registerNodeImageSources(normalizedNodeId, { [result.storage_key]: args.sourceUrl });
      }
      return result;
    });
    importByNodeAndCacheKey.set(importKey, promise);
  }
  return importByNodeAndCacheKey.get(importKey)!;
}
