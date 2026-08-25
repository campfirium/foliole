import type { NativeImportLocalImageAttachmentResult } from '../../lib/platform/nativeStorageContract.js';

import {
  createRemoteImageDownloadError,
  handleRemoteImageFetchError,
  recordRemoteImageAttemptDiagnostic,
  resolveRemoteImageAttemptResponse
} from './remoteImageDownloadAttemptResult.js';
import {
  fetchRemoteImage,
  type RemoteImageAttempt,
  type RemoteImageFetchResponse,
  type RemoteImageFetchStrategy
} from './remoteImageFetchAttempt.js';
import {
  resolveRemoteImageTransportName,
  type RemoteImageFetchTransport
} from './remoteImageTransport.js';
import { isAllowedRemoteImageHostname } from './remoteImageUrlGuard.js';

export type { RemoteImageFetchTransport } from './remoteImageTransport.js';
export {
  createRemoteImageDownloadError,
  createRemoteImagePolicyError,
  resolveRemoteImageFailureCacheMs
} from './remoteImageDownloadAttemptResult.js';
export type RemoteImageErrorResult = Extract<NativeImportLocalImageAttachmentResult, { status: 'error' }>;

export interface RemoteImageFetchOptions {
  bypassFailureCache?: boolean;
  sourceOrigin?: string | null;
}

interface RemoteImageBytesResult {
  bytes: Uint8Array;
  cacheKey: string;
  mimeType: string;
  originalName: string;
  sourceUrl: string;
}

export type RemoteImageFetchResult =
  | { status: 'ready'; resource: RemoteImageBytesResult; strategy: RemoteImageFetchStrategy }
  | { status: 'error'; error: RemoteImageErrorResult };

export function resolveRemoteImageCacheKey(sourceUrl: string) {
  try {
    const parsed = new URL(sourceUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    if (!isAllowedRemoteImageHostname(parsed.hostname)) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

export function resolveRemoteImageFetchKey(cacheKey: string, sourceOrigin: string | null) {
  return `${cacheKey}\u0000${sourceOrigin ?? ''}`;
}

export function resolveImageHost(sourceUrl: string) {
  try {
    return new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
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
  } catch (error) {
    return handleRemoteImageFetchError(sourceUrl, attempt, startedAt, transportName, error);
  }
  try {
    return await resolveRemoteImageAttemptResponse({
      attempt,
      cacheKey,
      fetched,
      response,
      sourceUrl,
      startedAt,
      transportName
    });
  } catch {
    recordRemoteImageAttemptDiagnostic(sourceUrl, attempt, Date.now() - startedAt, transportName, response, null, 'download_failed');
    return { status: 'error', error: createRemoteImageDownloadError('The remote image could not be downloaded.', sourceUrl) };
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
  const direct = await runRemoteImageAttempt(
    sourceUrl,
    cacheKey,
    { attempt: 1, sourceOrigin, strategy: 'direct' },
    fetchTransportForTests
  );
  return direct.status === 'ready' || !sourceOrigin
    ? direct
    : runRemoteImageAttempt(
      sourceUrl,
      cacheKey,
      { attempt: 2, sourceOrigin, strategy: 'source-origin' },
      fetchTransportForTests
    );
}
