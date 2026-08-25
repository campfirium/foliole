// @vitest-environment node

import { expect, it, vi } from 'vitest';

import {
  createRemoteImageDownloadError,
  createRemoteImagePolicyError,
  downloadRemoteImageBytes,
  resolveRemoteImageFailureCacheMs
} from './remoteImageDownload.js';

const SOURCE_URL = 'https://example.com/images/cover.png';
const CACHE_KEY = 'https://example.com/images/cover.png';
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function createImageResponse(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new Response(body, {
    headers: { 'content-type': 'image/png', ...headers },
    status: 200
  });
}

it('rejects unsupported image mime subtypes', async () => {
  const transport = vi.fn(async () => createImageResponse(new TextEncoder().encode('<svg></svg>'), {
    'content-type': 'image/svg+xml'
  }));

  await expect(downloadRemoteImageBytes(SOURCE_URL, CACHE_KEY, null, transport))
    .resolves.toMatchObject({ error: { error_code: 'unsupported_format' }, status: 'error' });
});

it('rejects image responses whose bytes do not match the declared mime type', async () => {
  const transport = vi.fn(async () => createImageResponse(new TextEncoder().encode('not-png')));

  await expect(downloadRemoteImageBytes(SOURCE_URL, CACHE_KEY, null, transport))
    .resolves.toMatchObject({ error: { error_code: 'unsupported_format' }, status: 'error' });
});

it('rejects redirects to blocked internal targets before fetching them', async () => {
  const transport = vi.fn(async (sourceUrl: string) => {
    if (sourceUrl === SOURCE_URL) {
      return new Response(null, {
        headers: { location: 'http://169.254.169.254/latest/meta-data' },
        status: 302
      });
    }
    return createImageResponse(PNG_BYTES);
  });

  await expect(downloadRemoteImageBytes(SOURCE_URL, CACHE_KEY, null, transport))
    .resolves.toMatchObject({ error: { error_code: 'download_failed' }, status: 'error' });
  expect(transport).toHaveBeenCalledTimes(1);
});

it('rejects redirects after the bounded redirect count', async () => {
  const transport = vi.fn(async () => new Response(null, {
    headers: { location: 'https://example.com/images/next.png' },
    status: 302
  }));

  await expect(downloadRemoteImageBytes(SOURCE_URL, CACHE_KEY, null, transport))
    .resolves.toMatchObject({ error: { error_code: 'download_failed' }, status: 'error' });
  expect(transport).toHaveBeenCalledTimes(6);
});

it.each<[string | null]>([
  [null],
  ['http://[::1']
])('rejects redirects with %s location targets', async (location) => {
  const headers = new Headers();
  if (location) headers.set('location', location);
  const transport = vi.fn(async () => new Response(null, { headers, status: 302 }));

  await expect(downloadRemoteImageBytes(SOURCE_URL, CACHE_KEY, null, transport))
    .resolves.toMatchObject({ error: { error_code: 'download_failed' }, status: 'error' });
  expect(transport).toHaveBeenCalledTimes(1);
});

it('omits session credentials from remote image requests', async () => {
  const transport = vi.fn(async () => createImageResponse(PNG_BYTES));

  await expect(downloadRemoteImageBytes(SOURCE_URL, CACHE_KEY, null, transport))
    .resolves.toMatchObject({ status: 'ready' });
  expect(transport).toHaveBeenCalledWith(SOURCE_URL, expect.objectContaining({ credentials: 'omit' }));
});

it('uses stable failure caching for policy failures but not generic download failures', () => {
  const policyFailureMs = resolveRemoteImageFailureCacheMs(
    createRemoteImagePolicyError('The remote image URL is not supported.', SOURCE_URL)
  );
  const genericFailureMs = resolveRemoteImageFailureCacheMs(
    createRemoteImageDownloadError('The remote image could not be downloaded.', SOURCE_URL)
  );

  expect(policyFailureMs).toBeGreaterThan(genericFailureMs);
});
