import path from 'node:path';

import { normalizeImageFileName, resolveImageMimeType } from './importImageAttachmentBytes.js';
import { readRemoteImageResponseBytes } from './remoteImageBodyReader.js';
import {
  recordRemoteImageDiagnostic,
  type RemoteImageDiagnosticEvent
} from './remoteImageDiagnostics.js';
import type { RemoteImageErrorResult, RemoteImageFetchResult } from './remoteImageDownload.js';
import type {
  RemoteImageAttempt,
  RemoteImageFetchResponse
} from './remoteImageFetchAttempt.js';
import { RemoteImagePolicyError } from './remoteImageFetchPolicy.js';
import { isSupportedImageMimeType, validateSupportedImageBytes } from './supportedImageFormats.js';

const REMOTE_IMAGE_TRANSIENT_FAILURE_CACHE_MS = 5_000;
const REMOTE_IMAGE_STABLE_FAILURE_CACHE_MS = 60_000;

const stableFailureErrors = new WeakSet<RemoteImageErrorResult>();

interface RemoteImageAttemptResponseArgs {
  attempt: RemoteImageAttempt;
  cacheKey: string;
  fetched: RemoteImageFetchResponse;
  response: Response;
  sourceUrl: string;
  startedAt: number;
  transportName: RemoteImageDiagnosticEvent['transport'];
}

export function createRemoteImageDownloadError(message: string, sourceUrl: string): RemoteImageErrorResult {
  return {
    status: 'error',
    error_code: 'download_failed',
    message,
    source_path: sourceUrl
  };
}

export function createRemoteImagePolicyError(message: string, sourceUrl: string): RemoteImageErrorResult {
  const error = createRemoteImageDownloadError(message, sourceUrl);
  stableFailureErrors.add(error);
  return error;
}

export function resolveRemoteImageFailureCacheMs(error: RemoteImageErrorResult) {
  return stableFailureErrors.has(error) || error.error_code === 'unsupported_format' || error.message.includes('status 404')
    ? REMOTE_IMAGE_STABLE_FAILURE_CACHE_MS
    : REMOTE_IMAGE_TRANSIENT_FAILURE_CACHE_MS;
}

export function handleRemoteImageFetchError(
  sourceUrl: string,
  attempt: RemoteImageAttempt,
  startedAt: number,
  transportName: RemoteImageDiagnosticEvent['transport'],
  error: unknown
): RemoteImageFetchResult {
  recordRemoteImageAttemptDiagnostic(sourceUrl, attempt, Date.now() - startedAt, transportName, null, null, 'download_failed');
  if (error instanceof RemoteImagePolicyError) {
    return { status: 'error', error: createRemoteImagePolicyError(error.message, sourceUrl) };
  }
  return { status: 'error', error: createRemoteImageDownloadError('The remote image could not be downloaded.', sourceUrl) };
}

export async function resolveRemoteImageAttemptResponse(
  args: RemoteImageAttemptResponseArgs
): Promise<RemoteImageFetchResult> {
  if (!args.response.ok) return createStatusFailure(args);
  const mimeType = resolveImageMimeTypeFromResponse(args.sourceUrl, args.response);
  if (!mimeType) return createUnsupportedMimeFailure(args);
  const bytes = await readSupportedRemoteImageBytes(args, mimeType);
  if (bytes.status === 'error') return bytes;
  recordRemoteImageAttemptDiagnostic(
    args.sourceUrl,
    args.attempt,
    Date.now() - args.startedAt,
    args.transportName,
    args.response,
    bytes.value.length,
    null
  );
  return {
    status: 'ready',
    resource: {
      bytes: bytes.value,
      cacheKey: args.cacheKey,
      mimeType,
      originalName: resolveOriginalName(args.sourceUrl, mimeType),
      sourceUrl: args.sourceUrl
    },
    strategy: args.attempt.strategy
  };
}

export function recordRemoteImageAttemptDiagnostic(
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

function createUnsupportedFormatResult(sourceUrl: string): RemoteImageErrorResult {
  return {
    status: 'error',
    error_code: 'unsupported_format',
    message: 'Only png, jpg, jpeg, webp, and gif images are supported.',
    source_path: sourceUrl
  };
}

function resolveImageMimeTypeFromResponse(sourceUrl: string, response: Response) {
  const headerValue = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (headerValue) return isSupportedImageMimeType(headerValue) ? headerValue : '';
  return headerValue ? '' : resolveImageMimeType(sourceUrl);
}

function resolveOriginalName(sourceUrl: string, mimeType: string) {
  try {
    return normalizeImageFileName(decodeURIComponent(path.basename(new URL(sourceUrl).pathname)), mimeType);
  } catch {
    return normalizeImageFileName('', mimeType);
  }
}

function createStatusFailure(args: RemoteImageAttemptResponseArgs): RemoteImageFetchResult {
  recordRemoteImageAttemptDiagnostic(args.sourceUrl, args.attempt, Date.now() - args.startedAt, args.transportName, args.response, null, 'download_failed');
  return { status: 'error', error: createRemoteImageDownloadError(`The remote image request failed with status ${args.response.status}.`, args.sourceUrl) };
}

function createUnsupportedMimeFailure(args: RemoteImageAttemptResponseArgs): RemoteImageFetchResult {
  recordRemoteImageAttemptDiagnostic(args.sourceUrl, args.attempt, Date.now() - args.startedAt, args.transportName, args.response, null, 'unsupported_format');
  return { status: 'error', error: createUnsupportedFormatResult(args.sourceUrl) };
}

async function readSupportedRemoteImageBytes(
  args: RemoteImageAttemptResponseArgs,
  mimeType: string
): Promise<{ status: 'ready'; value: Uint8Array } | { status: 'error'; error: RemoteImageErrorResult }> {
  const readResult = await readRemoteImageResponseBytes(args.response, args.fetched.signal).catch(() => null);
  if (!readResult) return createReadFailure(args, null, 'The remote image could not be downloaded.');
  if (readResult.status === 'too_large')
    return createReadFailure(args, readResult.bytes, 'The remote image is larger than the supported size limit.');
  if (readResult.bytes.length === 0) return createReadFailure(args, 0, 'The remote image response was empty.');
  if (!validateSupportedImageBytes(readResult.bytes, mimeType)) return createUnsupportedBytesFailure(args, readResult.bytes.length);
  return { status: 'ready', value: readResult.bytes };
}

function createReadFailure(
  args: RemoteImageAttemptResponseArgs,
  bytes: number | null,
  message: string
): { status: 'error'; error: RemoteImageErrorResult } {
  recordRemoteImageAttemptDiagnostic(args.sourceUrl, args.attempt, Date.now() - args.startedAt, args.transportName, args.response, bytes, 'download_failed');
  return { status: 'error', error: createRemoteImageDownloadError(message, args.sourceUrl) };
}

function createUnsupportedBytesFailure(
  args: RemoteImageAttemptResponseArgs,
  bytes: number
): { status: 'error'; error: RemoteImageErrorResult } {
  recordRemoteImageAttemptDiagnostic(args.sourceUrl, args.attempt, Date.now() - args.startedAt, args.transportName, args.response, bytes, 'unsupported_format');
  return { status: 'error', error: createUnsupportedFormatResult(args.sourceUrl) };
}

function resolveImageHost(sourceUrl: string) {
  try {
    return new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}
