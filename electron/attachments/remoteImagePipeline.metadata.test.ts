// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import {
  configureRemoteImageFetchTransportForTests,
  fetchRemoteImageMetadata,
  fetchRemoteImageResource,
  resetRemoteImagePipelineForTests
} from './remoteImagePipeline.js';

const SOURCE_URL = 'https://example.com/image';

function pngPrefix() {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    0, 0, 1, 0x40, 0, 0, 0, 0xf0
  ]);
}

const metadataCases = [
  { format: 'PNG', prefix: pngPrefix() },
  {
    format: 'JPEG',
    prefix: new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0,
      0xff, 0xc0, 0, 11, 8, 0, 0xf0, 1, 0x40, 3, 1, 0x11, 0
    ])
  },
  { format: 'GIF', prefix: new Uint8Array([...new TextEncoder().encode('GIF89a'), 0x40, 1, 0xf0, 0]) },
  {
    format: 'WebP',
    prefix: (() => {
      const bytes = new Uint8Array(30);
      bytes.set(new TextEncoder().encode('RIFF'), 0);
      bytes.set(new TextEncoder().encode('WEBP'), 8);
      bytes.set(new TextEncoder().encode('VP8X'), 12);
      bytes.set([0x3f, 1, 0], 24);
      bytes.set([0xef, 0, 0], 27);
      return bytes;
    })()
  }
];

beforeEach(() => resetRemoteImagePipelineForTests());

it.each(metadataCases)('resolves $format metadata before the shared resource stream closes', async ({ prefix }) => {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const transport = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
    start(value) { controller = value; }
  }), { status: 200 }));
  configureRemoteImageFetchTransportForTests(transport);

  const metadata = fetchRemoteImageMetadata(SOURCE_URL);
  const resource = fetchRemoteImageResource(SOURCE_URL);
  await vi.waitFor(() => expect(controller).not.toBeNull());
  controller!.enqueue(prefix);

  await expect(metadata).resolves.toEqual({ height: 240, width: 320 });
  let resourceSettled = false;
  void resource.then(() => { resourceSettled = true; });
  await Promise.resolve();
  expect(resourceSettled).toBe(false);

  controller!.close();
  await expect(resource).resolves.toMatchObject({ status: 'ready' });
  expect(transport).toHaveBeenCalledTimes(1);
});

it('does not turn early metadata into a successful resource after a stream failure', async () => {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  configureRemoteImageFetchTransportForTests(vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
    start(value) { controller = value; }
  }), { status: 200 })));

  const metadata = fetchRemoteImageMetadata(SOURCE_URL);
  const resource = fetchRemoteImageResource(SOURCE_URL);
  await vi.waitFor(() => expect(controller).not.toBeNull());
  controller!.enqueue(pngPrefix());
  await expect(metadata).resolves.toEqual({ height: 240, width: 320 });
  controller!.error(new Error('stream failed'));

  await expect(resource).resolves.toMatchObject({ status: 'error' });
});
