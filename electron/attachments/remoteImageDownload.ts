import path from 'node:path';

import type { NativeImportLocalImageAttachmentResult } from '../../lib/platform/nativeStorageContract.js';

import { normalizeImageFileName, resolveImageMimeType } from './importImageAttachmentBytes.js';
import { readRemoteImageResponseBytes } from './remoteImageBodyReader.js';
import {
  recordRemoteImageDiagnostic,
  type RemoteImageDiagnosticEvent
} from './remoteImageDiagnostics.js';
import {
  fetchRemoteImageWithRuntimeTransport,
  resolveRemoteImageTransportName,
  type RemoteImageFetchTransport
} from './remoteImageTransport.js';

const REMOTE_IMAGE_TIMEOUT_MS = 12_000;
const REMOTE_IMAGE_TRANSIENT_FAILURE_CACHE_MS = 5_000;
const REMOTE_IMAGE_STABLE_FAILURE_CACHE_MS = 60_000;

export type { RemoteImageFetchTransport } from './remoteImageTransport.js';
export type RemoteImageErrorResult = Extract<NativeImportLocalImageAttachmentResult, { status: 'error' }>;

type RemoteImageFetchStrategy = 'direct' | 'source-origin';

export interface RemoteImageFetchOptions {
  bypassFailureCache?: boolean;
  sourceOrigin?: string | null;
}

interface RemoteImageAttempt {
  attempt: number;
  sourceOrigin: string | null;
  strategy: RemoteImageFetchStrategy;
}

interface RemoteImageFetchResponse {
  clearTimeout: () => void;
  response: Response;
  signal: AbortSignal;
}

export interface RemoteImageBytesResult {
  bytes: Uint8Array;
  cacheKey: string;
  mimeType: string;
  originalName: string;
  sourceUrl: string;
}

export type RemoteImageFetchResult =
  | { status: 'ready'; resource: RemoteImageBytesResult; strategy: RemoteImageFetchStrategy }
  | { status: 'error'; error: RemoteImageErrorResult };

export function createRemoteImageDownloadError(message: string, sourceUrl: string): RemoteImageErrorResult {
  return {
    status: 'error',
    error_code: 'download_failed',
    message,
    source_path: sourceUrl
  };
}

function createUnsupportedFormatResult(sourceUrl: string): RemoteImageErrorResult {
  return {
    status: 'error',
    error_code: 'unsupported_format',
    message: 'Only png, jpg, jpeg, webp, and gif images are supported.',
    source_path: sourceUrl
  };
}

export function resolveRemoteImageCacheKey(sourceUrl: string) {
  try {
    const parsed = new URL(sourceUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

export function resolveRemoteImageFetchKey(cacheKey: string, sourceOrigin: string | null) {
  return `${cacheKey}\u0000${sourceOrigin ?? ''}`;
}

export function resolveRemoteImageFailureCacheMs(error: RemoteImageErrorResult) {
  return error.error_code === 'unsupported_format' || error.message.includes('status 404')
    ? REMOTE_IMAGE_STABLE_FAILURE_CACHE_MS
    : REMOTE_IMAGE_TRANSIENT_FAILURE_CACHE_MS;
}

export function resolveImageHost(sourceUrl: string) {
  try {
    return new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function resolveImageMimeTypeFromResponse(sourceUrl: string, response: Response) {
  const headerValue = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (headerValue.startsWith('image/')) return headerValue;
  return headerValue ? '' : resolveImageMimeType(sourceUrl);
}

function resolveOriginalName(sourceUrl: string, mimeType: string) {
  try {
    return normalizeImageFileName(decodeURIComponent(path.basename(new URL(sourceUrl).pathname)), mimeType);
  } catch {
    return normalizeImageFileName('', mimeType);
  }
}

function createAttemptHeaders(attempt: RemoteImageAttempt): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'image/*,*/*;q=0.8' };
  if (attempt.strategy === 'source-origin' && attempt.sourceOrigin) {
    headers.Referer = attempt.sourceOrigin;
    headers['Sec-Fetch-Dest'] = 'image';
    headers['Sec-Fetch-Site'] = 'cross-site';
  }
  return headers;
}

async function fetchRemoteImage(
  sourceUrl: string,
  attempt: RemoteImageAttempt,
  fetchTransportForTests: RemoteImageFetchTransport | null
): Promise<RemoteImageFetchResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);
  const transport = fetchTransportForTests ?? fetchRemoteImageWithRuntimeTransport;
  try {
    const response = await transport(sourceUrl, { headers: createAttemptHeaders(attempt), redirect: 'follow', signal: controller.signal });
    return { clearTimeout: () => clearTimeout(timeout), response, signal: controller.signal };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

function recordAttemptDiagnostic(
  sourceUrl: string,
  attempt: RemoteImageAttempt,
  elapsedMs: number,
  transport: RemoteImageDiagnosticEvent['transport'],
  response: Response | null,
  bytes: number | null,
  errorCode: string | null
) {
  recordRemoteImageDiagnostic({
    attempt: attempt.attempt,
    bytes,
    cache: 'none',
    contentType: response?.headers.get('content-type') ?? null,
    elapsedMs,
    errorCode,
    imageHost: resolveImageHost(sourceUrl),
    sourceOrigin: attempt.sourceOrigin,
    status: response?.status ?? null,
    strategy: attempt.strategy,
    transport
  });
}

async function runRemoteImageAttempt(
  sourceUrl: string,
  cacheKey: string,
  attempt: RemoteImageAttempt,
  fetchTransportForTests: RemoteImageFetchTransport | null
): Promise<RemoteImageFetchResult> {
  const startedAt = Date.now();
  const transportName = resolveRemoteImageTransportName(fetchTransportForTests);
  let fetched: RemoteImageFetchResponse;
  let response: Response;
  try {
    fetched = await fetchRemoteImage(sourceUrl, attempt, fetchTransportForTests);
    response = fetched.response;
  } catch {
    recordAttemptDiagnostic(sourceUrl, attempt, Date.now() - startedAt, transportName, null, null, 'download_failed');
    return { status: 'error', error: createRemoteImageDownloadError('The remote image could not be downloaded.', sourceUrl) };
  }
  try {
    if (!response.ok) {
      recordAttemptDiagnostic(sourceUrl, attempt, Date.now() - startedAt, transportName, response, null, 'download_failed');
      return { status: 'error', error: createRemoteImageDownloadError(`The remote image request failed with status ${response.status}.`, sourceUrl) };
    }
    const mimeType = resolveImageMimeTypeFromResponse(sourceUrl, response);
    if (!mimeType) {
      recordAttemptDiagnostic(sourceUrl, attempt, Date.now() - startedAt, transportName, response, null, 'unsupported_format');
      return { status: 'error', error: createUnsupportedFormatResult(sourceUrl) };
    }
    const readResult = await readRemoteImageResponseBytes(response, fetched.signal).catch(() => null);
    if (!readResult) {
      recordAttemptDiagnostic(sourceUrl, attempt, Date.now() - startedAt, transportName, response, null, 'download_failed');
      return { status: 'error', error: createRemoteImageDownloadError('The remote image could not be downloaded.', sourceUrl) };
    }
    if (readResult.status === 'too_large') {
      recordAttemptDiagnostic(sourceUrl, attempt, Date.now() - startedAt, transportName, response, readResult.bytes, 'download_failed');
      return { status: 'error', error: createRemoteImageDownloadError('The remote image is larger than the supported size limit.', sourceUrl) };
    }
    const { bytes } = readResult;
    if (bytes.length === 0) {
      recordAttemptDiagnostic(sourceUrl, attempt, Date.now() - startedAt, transportName, response, 0, 'download_failed');
      return { status: 'error', error: createRemoteImageDownloadError('The remote image response was empty.', sourceUrl) };
    }
    recordAttemptDiagnostic(sourceUrl, attempt, Date.now() - startedAt, transportName, response, bytes.length, null);
    return {
      status: 'ready',
      resource: { bytes, cacheKey, mimeType, originalName: resolveOriginalName(sourceUrl, mimeType), sourceUrl },
      strategy: attempt.strategy
    } satisfies RemoteImageFetchResult;
  } finally {
    fetched.clearTimeout();
  }
}

export async function downloadRemoteImageBytes(
  sourceUrl: string,
  cacheKey: string,
  sourceOrigin: string | null,
  fetchTransportForTests: RemoteImageFetchTransport | null
): Promise<RemoteImageFetchResult> {
  const direct = await runRemoteImageAttempt(sourceUrl, cacheKey, { attempt: 1, sourceOrigin, strategy: 'direct' }, fetchTransportForTests);
  return direct.status === 'ready' || !sourceOrigin
    ? direct
    : runRemoteImageAttempt(sourceUrl, cacheKey, { attempt: 2, sourceOrigin, strategy: 'source-origin' }, fetchTransportForTests);
}
