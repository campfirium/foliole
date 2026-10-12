import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdtemp, readFile, rename, rm, stat, truncate } from 'node:fs/promises';
import path from 'node:path';

import { waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort';
import { createDesktopFramedSyncFiles } from '../../../../../../electron/sync/desktopFramedSyncFiles';
import { ATTACHMENT_BLOCK_BYTES as BLOCK } from '../../../../../../lib/core/sync/attachmentBlockReceiver';
import type { NativeCompanionFramedFileRequest } from '../../../../../../lib/platform/nativeCompanionFramedFilesContract';
import { createMarkdownImageWidgetDom, disposeMarkdownImageWidgetDom } from '../../../../../features/editor/adapters/liveMarkdownImages';
import { resetAttachmentResourceResolutionCacheForTest } from '../../../attachmentResources';

const native = vi.hoisted(() => ({ access: vi.fn(), resolve: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true,
  convertFileSrc: (url: string) => url }, registerPlugin: () => ({}) }));
vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({
  isNativeCompanionAttachmentResourceRuntime: () => true,
  FolioleCompanionSync: { accessFramedSyncFile: native.access, resolveAttachmentResource: native.resolve }
}));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => {
  throw new Error('An explicit test owner is required');
} }));

import { createCompanionAttachmentHost } from './companionAttachmentBlockFiles';

it.each([false, true])('refreshes an open missing image after complete bytes and index commit (retry=%s)', async retry => {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/attachment-image-'));
  const sqlite = new Database(path.join(root, 'library.db'));
  sqlite.exec('CREATE TABLE framed_sync_resource_availability (hash TEXT PRIMARY KEY, available INTEGER)');
  const port = createBetterSqliteDbPort(sqlite);
  const bytes = Buffer.alloc(BLOCK + 19, 0x78);
  const hash = digest(bytes), key = `${hash}.png`, final = path.join(root, key);
  native.access.mockImplementation(fileOperations(root));
  native.resolve.mockImplementation(async () => {
    try { await readFile(final); return { status: 'ready', resource_url: `file://${final}`, mime_type: 'image/png' }; }
    catch { return { status: 'missing_file' }; }
  });
  let rejectIndex = retry;
  const host = await createCompanionAttachmentHost({ files: createDesktopFramedSyncFiles(path.join(root, 'transport')),
    readSnapshot: read => read(port), write: write => {
      if (rejectIndex && existsSync(final)) { rejectIndex = false; throw new Error('index interrupted'); }
      return write(port);
    } }, { library_key: root, generation_id: 'generation' });
  const widget = createMarkdownImageWidgetDom({ alt: 'restored', attachmentId: hash, display: 'block',
    from: 0, source: `asset://${key}`, to: 90 });
  document.body.append(widget);
  try {
    await waitFor(() => expect(widget.querySelector('[data-md-image-status="unavailable"]')).not.toBeNull());
    const resource = { storageKey: key, byteLength: bytes.length };
    await host.receive(resource, 0, bytes.subarray(0, BLOCK));
    expect(widget.querySelector('img')).toBeNull();
    if (retry) {
      await expect(host.receive(resource, BLOCK, bytes.subarray(BLOCK))).rejects.toThrow('index interrupted');
      expect(widget.querySelector('img')).toBeNull();
      await host.status(resource);
    } else await host.receive(resource, BLOCK, bytes.subarray(BLOCK));
    expect(await readFile(final)).toEqual(bytes);
    expect(sqlite.prepare('SELECT available FROM framed_sync_resource_availability').pluck().get()).toBe(1);
    await waitFor(() => expect(widget.querySelector('.cm-md-image-element')).toHaveAttribute('src', `file://${final}`));
  } finally {
    disposeMarkdownImageWidgetDom(widget); widget.remove(); resetAttachmentResourceResolutionCacheForTest();
    sqlite.close(); await rm(root, { recursive: true, force: true });
  }
});

function digest(bytes: Uint8Array) { return createHash('sha256').update(bytes).digest('hex'); }

/** Only native file calls are substituted; the production receiver, adapter, SQLite and image widget run unchanged. */
function fileOperations(root: string) {
  return async (input: NativeCompanionFramedFileRequest) => {
    if (input.operation !== 'attachment') throw new Error('Unexpected native operation');
    const partial = path.join(root, `.attachment-${input.key.slice(0, 64)}.partial`);
    const file = input.partial ? partial : path.join(root, input.key);
    switch (input.action) {
      case 'acquire': return {};
      case 'stat': {
        try { const info = await stat(file); return { present: true, length: info.size,
          hash: input.partial ? '' : digest(await readFile(file)) }; }
        catch { return { present: false, length: 0, hash: '' }; }
      }
      case 'truncate': await appendFile(partial, ''); await truncate(partial, input.length); return {};
      case 'append': await appendFile(partial, Buffer.from(input.base64!, 'base64')); return {};
      case 'hash': return { hash: digest(await readFile(file)) };
      case 'publish': await rename(partial, file); return {};
      default: throw new Error(`Unexpected attachment action: ${input.action}`);
    }
  };
}
