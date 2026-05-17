import path from 'node:path';

import type {
  NativeImportLocalImageAttachmentResult,
  NativeImportRemoteImageAttachmentArgs
} from '../../lib/platform/nativeStorageContract.js';

import { importImageAttachmentBytes, normalizeImageFileName, resolveImageMimeType } from './importImageAttachmentBytes.js';
import {
  configureRemoteImageCacheRoot,
  readRemoteImageCache,
  resetRemoteImageCacheForTests,
  writeRemoteImageCache
} from './remoteImageCache.js';

const REMOTE_IMAGE_TIMEOUT_MS = 12_000;
const REMOTE_IMAGE_FAILURE_CACHE_MS = 30_000;

type RemoteImageFetchTransport = (sourceUrl: string, init: RequestInit) => Promise<Response>;

interface RemoteImageBytesResult {
  bytes: Uint8Array;
  cacheKey: string;
  mimeType: string;
  originalName: string;
  sourceUrl: string;
}

type RemoteImageFetchResult =
  | { status: 'ready'; resource: RemoteImageBytesResult }
  | { status: 'error'; error: NativeImportLocalImageAttachmentResult };

const fetchByCacheKey = new Map<string, Promise<RemoteImageFetchResult>>();
const importByNodeAndCacheKey = new Map<string, Promise<NativeImportLocalImageAttachmentResult>>();
const failureByCacheKey = new Map<string, { error: NativeImportLocalImageAttachmentResult; expiresAt: number }>();
let fetchTransportForTests: RemoteImageFetchTransport | null = null;

function createErrorResult(message: string, sourceUrl: string): NativeImportLocalImageAttachmentResult {
  return {
    status: 'error',
    error_code: 'download_failed',
    message,
    source_path: sourceUrl
  };
}

function createUnsupportedFormatResult(sourceUrl: string): NativeImportLocalImageAttachmentResult {
  return {
    status: 'error',
    error_code: 'unsupported_format',
    message: 'Only png, jpg, jpeg, webp, and gif images are supported.',
    source_path: sourceUrl
  };
}

function resolveRemoteImageCacheKey(sourceUrl: string) {
  try {
    const parsed = new URL(sourceUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function resolveImageMimeTypeFromResponse(sourceUrl: string, response: Response) {
  const headerValue = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (headerValue.startsWith('image/')) {
    return headerValue;
  }
  return resolveImageMimeType(sourceUrl);
}

function resolveOriginalName(sourceUrl: string, mimeType: string) {
  try {
    const pathname = new URL(sourceUrl).pathname;
    const decodedName = decodeURIComponent(path.basename(pathname));
    return normalizeImageFileName(decodedName, mimeType);
  } catch {
    return normalizeImageFileName('', mimeType);
  }
}

async function fetchRemoteImage(sourceUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);
  try {
    return await resolveRemoteImageFetchTransport()(sourceUrl, {
      redirect: 'follow',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function resolveRemoteImageFetchTransport(): RemoteImageFetchTransport {
  return fetchTransportForTests ?? fetchRemoteImageWithRuntimeTransport;
}

async function fetchRemoteImageWithRuntimeTransport(sourceUrl: string, init: RequestInit) {
  const electronNetFetch = await resolveElectronNetFetch();
  if (electronNetFetch) {
    return electronNetFetch(sourceUrl, init);
  }
  return fetch(sourceUrl, init);
}

async function resolveElectronNetFetch(): Promise<RemoteImageFetchTransport | null> {
  if (!process.versions.electron) {
    return null;
  }
  try {
    const electronModule = await import('electron');
    const netFetch = (electronModule as { net?: { fetch?: RemoteImageFetchTransport } }).net?.fetch;
    return typeof netFetch === 'function' ? netFetch.bind(electronModule.net) : null;
  } catch {
    return null;
  }
}

function readFailureCache(cacheKey: string) {
  const cached = failureByCacheKey.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.error;
  }
  failureByCacheKey.delete(cacheKey);
  return null;
}

async function loadRemoteImageBytes(sourceUrl: string, cacheKey: string): Promise<RemoteImageFetchResult> {
  let response: Response;
  try {
    response = await fetchRemoteImage(sourceUrl);
  } catch {
    return { status: 'error', error: createErrorResult('The remote image could not be downloaded.', sourceUrl) };
  }

  if (!response.ok) {
    return { status: 'error', error: createErrorResult(`The remote image request failed with status ${response.status}.`, sourceUrl) };
  }

  const mimeType = resolveImageMimeTypeFromResponse(sourceUrl, response);
  if (!mimeType) {
    return { status: 'error', error: createUnsupportedFormatResult(sourceUrl) };
  }

  try {
    const resource = {
      bytes: new Uint8Array(await response.arrayBuffer()),
      cacheKey,
      mimeType,
      originalName: resolveOriginalName(sourceUrl, mimeType),
      sourceUrl
    };
    await writeRemoteImageCache(resource);
    return {
      status: 'ready',
      resource
    };
  } catch {
    return { status: 'error', error: createErrorResult('The remote image could not be read after download.', sourceUrl) };
  }
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

export async function fetchRemoteImageResource(sourceUrl: string): Promise<RemoteImageFetchResult> {
  const cacheKey = resolveRemoteImageCacheKey(sourceUrl);
  if (!cacheKey) {
    return { status: 'error', error: createErrorResult('The remote image URL is not supported.', sourceUrl) };
  }
  const cachedResource = await readRemoteImageCache(cacheKey);
  if (cachedResource) {
    return { status: 'ready', resource: cachedResource };
  }
  const cachedError = readFailureCache(cacheKey);
  if (cachedError) {
    return { status: 'error', error: cachedError };
  }
  if (!fetchByCacheKey.has(cacheKey)) {
    const promise = loadRemoteImageBytes(sourceUrl.trim(), cacheKey).then((result) => {
      if (result.status === 'error') {
        fetchByCacheKey.delete(cacheKey);
        failureByCacheKey.set(cacheKey, {
          error: result.error,
          expiresAt: Date.now() + REMOTE_IMAGE_FAILURE_CACHE_MS
        });
      }
      return result;
    });
    fetchByCacheKey.set(cacheKey, promise);
  }
  return fetchByCacheKey.get(cacheKey)!;
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
