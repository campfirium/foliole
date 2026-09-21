// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { handle, registerSchemesAsPrivileged } = vi.hoisted(() => ({
  handle: vi.fn(),
  registerSchemesAsPrivileged: vi.fn()
}));

const {
  importImageAttachmentBytes,
  resolveImageMimeType,
  normalizeImageFileName,
  runWithDatabaseConnectionOwner
} = vi.hoisted(() => ({
  importImageAttachmentBytes: vi.fn(),
  normalizeImageFileName: vi.fn((value: string) => value || 'pasted-image.png'),
  resolveImageMimeType: vi.fn(),
  runWithDatabaseConnectionOwner: vi.fn(async (execute: () => unknown) => execute())
}));

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/foliole-user-data') },
  protocol: {
    handle,
    registerSchemesAsPrivileged
  }
}));

vi.mock('../database/nodeImageSources.js', () => ({ registerNodeImageSources: vi.fn() }));

vi.mock('./importImageAttachmentBytes.js', () => ({
  importImageAttachmentBytes,
  normalizeImageFileName,
  resolveImageMimeType
}));
vi.mock('../database/connection.js', () => ({ runWithDatabaseConnectionOwner }));

vi.mock('./remoteImageSourceContext.js', () => ({
  resolveRemoteImageSourceContext: vi.fn(() => ({ sourceOrigin: null }))
}));

import { buildRemoteImageRenderUrl } from '../../lib/platform/remoteImageProtocolUrl.js';

import {
  configureRemoteImageFetchTransportForTests,
  configureRemoteImagePipelineCacheRoot,
  fetchRemoteImageMetadata,
  importRemoteImageAttachment,
  resetRemoteImagePipelineForTests
} from './remoteImagePipeline.js';
import { registerRemoteImageProtocol } from './remoteImageProtocol.js';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let cacheRoot: string;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  resetRemoteImagePipelineForTests();
  cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-image-integration-'));
  configureRemoteImagePipelineCacheRoot(cacheRoot);
});

afterEach(async () => {
  await fs.rm(cacheRoot, { recursive: true, force: true });
});

it('shares one remote fetch across protocol renders and auto localization', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(PNG_BYTES, {
      headers: { 'content-type': 'image/png' },
      status: 200
    })
  );
  vi.stubGlobal('fetch', fetchMock);
  importImageAttachmentBytes.mockResolvedValue({ status: 'imported', attachment_id: 'hash-1' });
  registerRemoteImageProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const url = buildRemoteImageRenderUrl({
    nodeId: 'node-1',
    persist: true,
    sourceUrl: 'https://example.com/cover.png'
  });

  await Promise.all([
    handler({ url }),
    handler({ url }),
    importRemoteImageAttachment({ nodeId: 'node-1', sourceUrl: 'https://example.com/cover.png' })
  ]);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(importImageAttachmentBytes).toHaveBeenCalledTimes(1);
});

it('does not acquire the sqlite owner while a shared remote fetch is pending', async () => {
  let resolveFetch!: (response: Response) => void;
  const fetchTransport = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
  configureRemoteImageFetchTransportForTests(fetchTransport);
  importImageAttachmentBytes.mockResolvedValue({ status: 'imported', attachment_id: 'hash-1' });

  const metadata = fetchRemoteImageMetadata('https://example.com/cover.png');
  const imported = importRemoteImageAttachment({ nodeId: 'node-1', sourceUrl: 'https://example.com/cover.png' });
  await vi.waitFor(() => expect(fetchTransport).toHaveBeenCalledTimes(1));
  expect(runWithDatabaseConnectionOwner).not.toHaveBeenCalled();

  resolveFetch(new Response(PNG_BYTES, { headers: { 'content-type': 'image/png' }, status: 200 }));
  await expect(Promise.all([metadata, imported])).resolves.toEqual([
    null,
    { status: 'imported', attachment_id: 'hash-1' }
  ]);
  expect(runWithDatabaseConnectionOwner).toHaveBeenCalledTimes(1);
});
