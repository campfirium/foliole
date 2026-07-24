// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { fetch, handle, registerSchemesAsPrivileged } = vi.hoisted(() => ({
  fetch: vi.fn(),
  handle: vi.fn(),
  registerSchemesAsPrivileged: vi.fn()
}));

const { loadExternalSearchFolders } = vi.hoisted(() => ({
  loadExternalSearchFolders: vi.fn()
}));

vi.mock('electron', () => ({
  net: { fetch },
  protocol: {
    handle,
    registerSchemesAsPrivileged
  }
}));

vi.mock('../database/externalSearchFolders.js', () => ({
  loadExternalSearchFolders
}));

import {
  buildExtDocImageRenderUrl,
  EXT_DOC_IMAGE_PROTOCOL_SCHEME
} from '../../lib/platform/extDocImageProtocolUrl.js';

import { registerExtDocImageProtocol, registerExtDocImageProtocolScheme } from './extDocImageProtocol.js';

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

it('registers the external document image scheme with secure standard privileges', () => {
  registerExtDocImageProtocolScheme();

  expect(registerSchemesAsPrivileged).toHaveBeenCalledWith([
    {
      scheme: EXT_DOC_IMAGE_PROTOCOL_SCHEME,
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true
      }
    }
  ]);
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
