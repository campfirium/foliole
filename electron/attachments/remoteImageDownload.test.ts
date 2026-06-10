// @vitest-environment node

import { afterEach, expect, it, vi } from 'vitest';

import { REMOTE_IMAGE_MAX_BYTES } from './remoteImageBodyReader.js';
import {
  configureRemoteImageDiagnosticSinkForTests,
  type RemoteImageDiagnosticEvent
} from './remoteImageDiagnostics.js';
import { downloadRemoteImageBytes, resolveRemoteImageCacheKey, type RemoteImageFetchTransport } from './remoteImageDownload.js';

const SOURCE_URL = 'https://example.com/images/cover.png';
const CACHE_KEY = 'https://example.com/images/cover.png';

afterEach(() => {
  configureRemoteImageDiagnosticSinkForTests(null);
  vi.useRealTimers();
});

function createImageResponse(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new Response(body, {
    headers: { 'content-type': 'image/png', ...headers },
    status: 200
  });
}

function createTransport(response: Response): RemoteImageFetchTransport {
  return vi.fn(async () => response);
}

async function downloadWith(response: Response) {
  return downloadRemoteImageBytes(SOURCE_URL, CACHE_KEY, null, createTransport(response));
}

it('keeps normal remote image responses downloadable', async () => {
  await expect(downloadWith(createImageResponse(new Uint8Array([1, 2, 3])))).resolves.toMatchObject({
    resource: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' },
    status: 'ready'
  });
});

it.each([
  'http://127.0.0.1/image.png',
  'http://[::1]/image.png',
  'http://10.0.0.1/image.png',
  'http://172.16.0.1/image.png',
  'http://192.168.0.1/image.png',
  'http://169.254.169.254/latest/meta-data',
  'http://localhost/image.png',
  'http://host.local/image.png',
  'http://metadata.google.internal/computeMetadata/v1/'
])('rejects remote image cache keys for SSRF-risk host %s', (sourceUrl) => {
  expect(resolveRemoteImageCacheKey(sourceUrl)).toBeNull();
});

it('keeps public remote image cache keys normalized', () => {
  expect(resolveRemoteImageCacheKey('HTTPS://Example.COM/images/cover.png#fragment')).toBe('https://example.com/images/cover.png');
});

it('rejects remote images when content-length is larger than the byte limit', async () => {
  const diagnostics: RemoteImageDiagnosticEvent[] = [];
  configureRemoteImageDiagnosticSinkForTests((event) => diagnostics.push(event));

  await expect(
    downloadWith(createImageResponse(new Uint8Array([1]), {
      'content-length': String(REMOTE_IMAGE_MAX_BYTES + 1)
    }))
  ).resolves.toMatchObject({
    error: { error_code: 'download_failed' },
    status: 'error'
  });
  expect(diagnostics.at(-1)).toMatchObject({
    bytes: REMOTE_IMAGE_MAX_BYTES + 1,
    errorCode: 'download_failed'
  });
});

it('keeps reading when content-length is invalid and the actual body fits', async () => {
  await expect(
    downloadWith(createImageResponse(new Uint8Array([4, 5]), {
      'content-length': 'not-a-number'
    }))
  ).resolves.toMatchObject({
    resource: { bytes: new Uint8Array([4, 5]) },
    status: 'ready'
  });
});

it('rejects remote images when the streamed body exceeds the byte limit', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(REMOTE_IMAGE_MAX_BYTES));
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    }
  });

  await expect(downloadWith(createImageResponse(body))).resolves.toMatchObject({
    error: { error_code: 'download_failed' },
    status: 'error'
  });
});

it('rejects remote images when content-length is under the byte limit but the streamed body is larger', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(REMOTE_IMAGE_MAX_BYTES));
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    }
  });

  await expect(downloadWith(createImageResponse(body, { 'content-length': '1' }))).resolves.toMatchObject({
    error: { error_code: 'download_failed' },
    status: 'error'
  });
});

it('maps body read errors to the existing download failure contract', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error('stream failed'));
    }
  });

  await expect(downloadWith(createImageResponse(body))).resolves.toEqual({
    error: {
      error_code: 'download_failed',
      message: 'The remote image could not be downloaded.',
      status: 'error',
      source_path: SOURCE_URL
    },
    status: 'error'
  });
});

it('keeps the fetch timeout active while reading the response body', async () => {
  vi.useFakeTimers();
  const body = new ReadableStream<Uint8Array>({
    pull() {
      return new Promise(() => undefined);
    }
  });
  const result = downloadWith(createImageResponse(body));

  await vi.advanceTimersByTimeAsync(12_000);

  await expect(result).resolves.toMatchObject({
    error: { error_code: 'download_failed' },
    status: 'error'
  });
});

it('checks the fallback arrayBuffer path when response.body is unavailable', async () => {
  const response = {
    arrayBuffer: vi.fn(async () => new Uint8Array([6, 7]).buffer),
    body: null,
    headers: new Headers({ 'content-type': 'image/png' }),
    ok: true,
    status: 200
  } as unknown as Response;

  await expect(downloadWith(response)).resolves.toMatchObject({
    resource: { bytes: new Uint8Array([6, 7]) },
    status: 'ready'
  });
});

it('rejects the fallback arrayBuffer path when response.body is unavailable and bytes exceed the limit', async () => {
  const response = {
    arrayBuffer: vi.fn(async () => new Uint8Array(REMOTE_IMAGE_MAX_BYTES + 1).buffer),
    body: null,
    headers: new Headers({ 'content-type': 'image/png' }),
    ok: true,
    status: 200
  } as unknown as Response;

  await expect(downloadWith(response)).resolves.toMatchObject({
    error: { error_code: 'download_failed' },
    status: 'error'
  });
});
