import {
  REMOTE_IMAGE_MAX_REDIRECTS,
  RemoteImagePolicyError,
  isRemoteImageRedirectStatus,
  resolveRemoteImageRedirectTarget,
  validateRemoteImageFetchTarget
} from './remoteImageFetchPolicy.js';
import {
  fetchRemoteImageWithRuntimeTransport,
  type RemoteImageFetchTransport
} from './remoteImageTransport.js';

const REMOTE_IMAGE_TIMEOUT_MS = 12_000;

export interface RemoteImageAttempt {
  attempt: number;
  sourceOrigin: string | null;
  strategy: 'direct' | 'source-origin';
}

export type RemoteImageFetchStrategy = RemoteImageAttempt['strategy'];

export interface RemoteImageFetchResponse {
  clearTimeout: () => void;
  response: Response;
  signal: AbortSignal;
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

async function fetchRemoteImageOnce(
  sourceUrl: string,
  attempt: RemoteImageAttempt,
  fetchTransportForTests: RemoteImageFetchTransport | null
): Promise<RemoteImageFetchResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);
  const transport = fetchTransportForTests ?? fetchRemoteImageWithRuntimeTransport;
  try {
    const response = await transport(sourceUrl, {
      credentials: 'omit',
      headers: createAttemptHeaders(attempt),
      redirect: 'manual',
      signal: controller.signal
    });
    return { clearTimeout: () => clearTimeout(timeout), response, signal: controller.signal };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

export async function fetchRemoteImage(
  sourceUrl: string,
  attempt: RemoteImageAttempt,
  fetchTransportForTests: RemoteImageFetchTransport | null
): Promise<RemoteImageFetchResponse> {
  let currentUrl = sourceUrl;
  let redirectCount = 0;
  while (true) {
    validateRemoteImageFetchTarget(currentUrl);
    const fetched = await fetchRemoteImageOnce(currentUrl, attempt, fetchTransportForTests);
    if (!isRemoteImageRedirectStatus(fetched.response.status)) {
      return fetched;
    }
    fetched.clearTimeout();
    if (redirectCount >= REMOTE_IMAGE_MAX_REDIRECTS) {
      throw new RemoteImagePolicyError('The remote image redirected too many times.');
    }
    currentUrl = resolveRemoteImageRedirectTarget(currentUrl, fetched.response.headers.get('location'));
    redirectCount += 1;
  }
}
