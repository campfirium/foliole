// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { fetch, handle } = vi.hoisted(() => ({
  fetch: vi.fn(),
  handle: vi.fn()
}));

const { loadExternalSearchFolders } = vi.hoisted(() => ({
  loadExternalSearchFolders: vi.fn()
}));

vi.mock('electron', () => ({
  net: { fetch },
  protocol: {
    handle
  }
}));

vi.mock('../database/externalSearchFolders.js', () => ({
  loadExternalSearchFolders
}));

import {
  buildExtDocImageRenderUrl
} from '../../lib/platform/extDocImageProtocolUrl.js';

import { registerExtDocImageProtocol } from './extDocImageProtocol.js';

const tempRoots: string[] = [];

async function createTempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-ext-doc-image-'));
  tempRoots.push(root);
  return root;
}

function createFolderConfig(root: string) {
  return {
    access_mode: 'local' as const,
    attachment_mode: 'document_relative_first_then_fixed_root' as const,
    attachment_root_path: path.join(root, 'attachments'),
    created_at: '',
    document_count: 0,
    excluded_dirs: [],
    folder_path: root,
    id: 'folder-1',
    indexed_at: null,
    last_error: null,
    source_executable: true,
    source_host_name: 'This Mac',
    source_host_platform: 'darwin',
    status: 'idle' as const,
    updated_at: ''
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetch.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
  loadExternalSearchFolders.mockReturnValue([]);
});

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

it('serves document-relative image resources without exposing image bytes in markdown content', async () => {
  const root = await createTempRoot();
  const noteDir = path.join(root, 'notes');
  const imageDir = path.join(noteDir, 'images');
  await mkdir(imageDir, { recursive: true });
  await writeFile(path.join(imageDir, 'cover.png'), 'png');

  registerExtDocImageProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const response = await handler({
    url: buildExtDocImageRenderUrl({
      documentAbsolutePath: path.join(noteDir, 'topic.md'),
      imageDestination: 'images/cover.png'
    })
  });

  expect(fetch.mock.calls[0]?.[0]).toContain(encodeURI('/images/cover.png'));
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/png');
  expect(response.headers.get('cache-control')).toBe('no-store');
});

it('serves attachment-root fallback images by deriving the folder from the document path', async () => {
  const root = await createTempRoot();
  const noteDir = path.join(root, 'notes');
  const attachmentDir = path.join(root, 'attachments');
  await mkdir(noteDir, { recursive: true });
  await mkdir(attachmentDir, { recursive: true });
  await writeFile(path.join(attachmentDir, 'Pasted image.png'), 'png');
  loadExternalSearchFolders.mockReturnValue([createFolderConfig(root)]);

  registerExtDocImageProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const response = await handler({
    url: buildExtDocImageRenderUrl({
      documentAbsolutePath: path.join(noteDir, 'topic.md'),
      imageDestination: 'Pasted image.png'
    })
  });

  expect(fetch.mock.calls[0]?.[0]).toContain(encodeURI('/attachments/Pasted image.png'));
  expect(response.status).toBe(200);
});

it('returns not found for paths that escape both allowed local bases', async () => {
  const root = await createTempRoot();
  const noteDir = path.join(root, 'notes');
  await mkdir(noteDir, { recursive: true });
  await writeFile(path.join(root, 'secret.png'), 'png');

  registerExtDocImageProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const response = await handler({
    url: buildExtDocImageRenderUrl({
      documentAbsolutePath: path.join(noteDir, 'topic.md'),
      imageDestination: '../secret.png'
    })
  });

  expect(response.status).toBe(404);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(fetch).not.toHaveBeenCalled();
});

it('uses the most specific folder and never a prefix sibling for attachment fallback', async () => {
  const root = await createTempRoot();
  const books = createFolderConfig(path.join(root, 'Books'));
  const nested = createFolderConfig(path.join(root, 'Books', 'Topics'));
  const sibling = createFolderConfig(path.join(root, 'BooksOld'));
  for (const folder of [books, nested, sibling]) {
    await mkdir(folder.attachment_root_path, { recursive: true });
    await writeFile(path.join(folder.attachment_root_path, 'cover.png'), 'png');
  }
  loadExternalSearchFolders.mockReturnValue([books, nested, sibling]);
  registerExtDocImageProtocol();
  const handler = handle.mock.calls[0]?.[1];
  for (const folder of [nested, sibling]) {
    fetch.mockClear();
    const response = await handler({ url: buildExtDocImageRenderUrl({
      documentAbsolutePath: path.join(folder.folder_path, 'topic.md'), imageDestination: 'cover.png'
    }) });
    expect(response.status).toBe(200);
    expect(fetch.mock.calls[0]?.[0]).toBe(pathToFileURL(path.join(folder.attachment_root_path, 'cover.png')).toString());
  }
  loadExternalSearchFolders.mockReturnValue([books]);
  fetch.mockClear();
  const response = await handler({ url: buildExtDocImageRenderUrl({
    documentAbsolutePath: path.join(sibling.folder_path, 'topic.md'), imageDestination: 'cover.png'
  }) });
  expect(response.status).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['remote_mirror', 'unavailable'] as const)('keeps %s sources out of attachment fallback', async (state) => {
  const root = await createTempRoot();
  const folder = createFolderConfig(root);
  await mkdir(folder.attachment_root_path, { recursive: true });
  await writeFile(path.join(folder.attachment_root_path, 'cover.png'), 'png');
  loadExternalSearchFolders.mockReturnValue([{
    ...folder, access_mode: state === 'remote_mirror' ? 'remote_mirror' : 'local',
    source_executable: state !== 'unavailable'
  }]);
  registerExtDocImageProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const response = await handler({ url: buildExtDocImageRenderUrl({
    documentAbsolutePath: path.join(root, 'topic.md'), imageDestination: 'cover.png'
  }) });
  expect(response.status).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
});
