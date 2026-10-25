import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { writeFile, appendFile, mkdtemp, readFile, rename, rm, stat, truncate } from 'node:fs/promises';
import path from 'node:path';

import { waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort';
import { createDesktopFramedSyncFiles } from '../../../../../../electron/sync/desktopFramedSyncFiles';
import { seedAttachmentReferences } from '../../../../../../electron/sync/desktopRequestSyncAttachments.testSupport';
import { initializeDatabaseSchema } from '../../../../../../lib/core/database/migrations';
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

it.each([[false, false, false], [true, false, false], [false, true, false], [true, true, false],
  [false, true, true], [true, true, true]])('refreshes an open missing image after complete bytes and index commit (retry=%s, nativeWindow=%s, asyncFinalization=%s)', async (retry, nativeWindow, asyncFinalization) => {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/attachment-image-'));
  const sqlite = new Database(path.join(root, 'library.db'));
  initializeDatabaseSchema(sqlite);
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
  const session = asyncFinalization ? await host.openReceiveSession!({ shouldYield: () => false }) : undefined;
  const widget = createMarkdownImageWidgetDom({ alt: 'restored', attachmentId: hash, display: 'block',
    from: 0, source: `asset://${key}`, to: 90 });
  document.body.append(widget);
  try {
    await waitFor(() => expect(widget.querySelector('[data-md-image-status="unavailable"]')).not.toBeNull());
    const resource = { storageKey: key, byteLength: bytes.length };
    const receive = async (offset: number, block: Uint8Array) => {
      if (!nativeWindow) return host.receive(resource, offset, block);
      if (session) await host.status(resource);
      const result = await (session?.receiveWindow ?? host.receiveWindow!)(resource, offset, async () => {
        await appendFile(path.join(root, `.attachment-${hash}.partial`), block);
        return { offset: offset + block.length, blocks: 1, pending: false };
      });
      await session?.settled(key);
      return result;
    };
    await receive(0, bytes.subarray(0, BLOCK));
    expect(widget.querySelector('img')).toBeNull();
    if (retry) {
      await expect(receive(BLOCK, bytes.subarray(BLOCK))).rejects.toThrow('index interrupted');
      expect(widget.querySelector('img')).toBeNull();
      await host.status(resource);
    } else await receive(BLOCK, bytes.subarray(BLOCK));
    expect(await readFile(final)).toEqual(bytes);
    expect(sqlite.prepare('SELECT available FROM framed_sync_resource_availability').pluck().get()).toBe(1);
    await waitFor(() => expect(widget.querySelector('.cm-md-image-element')).toHaveAttribute('src', `file://${final}`));
  } finally {
    await session?.close();
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
      case 'acquire': case 'source-close': return {};
      case 'source-open': return { present: true, length: (await stat(file)).size, hash: '' };
      case 'source-read': return { base64: (await readFile(file)).subarray(input.offset, input.offset! + input.length!).toString('base64') };
      case 'stat': {
        try { const info = await stat(file); return { present: true, length: info.size,
          hash: input.partial ? '' : digest(await readFile(file)) }; }
        catch { return { present: false, length: 0, hash: '' }; }
      }
      case 'truncate': await appendFile(partial, ''); await truncate(partial, input.length); return {};
      case 'append': await appendFile(partial, Buffer.from(input.base64!, 'base64')); return {};
      case 'hash': return { hash: digest(await readFile(file)) };
      case 'discard': await rm(partial, { force: true }); return {};
      case 'publish': await rename(partial, file); return {};
      default: throw new Error(`Unexpected attachment action: ${input.action}`);
    }
  };
}

it('checks only pending needs without opening or hashing present attachments', async () => {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/companion-needs-'));
  const sqlite = new Database(path.join(root, 'library.db'));
  initializeDatabaseSchema(sqlite);
  const port = createBetterSqliteDbPort(sqlite);
  const key = `${'b'.repeat(64)}.png`;
  await seedAttachmentReferences(sqlite, [key]);
  native.access.mockImplementation(async (input: NativeCompanionFramedFileRequest) => {
    if (input.operation !== 'attachment' || input.action !== 'source-stat-batch') throw new Error('Unexpected content read during needs');
    return { presence: await Promise.all(input.keys!.map(async key => {
      try { return (await stat(path.join(root, key))).isFile(); } catch { return false; }
    })) };
  });
  try {
    const host = await createCompanionAttachmentHost({ files: createDesktopFramedSyncFiles(path.join(root, 'transport')),
      readSnapshot: read => read(port), write: write => write(port)
    }, { library_key: root, generation_id: 'generation' });
    expect(await host.needs()).toEqual([key]);
    await writeFile(path.join(root, key), 'presence does not validate content');
    expect(await host.needs()).toEqual([]);
    await rm(path.join(root, key));
    expect(await host.needs()).toEqual([]);
    sqlite.exec("UPDATE nodes SET content = content || ' edited'");
    expect(await host.needs()).toEqual([key]);
    native.access.mockResolvedValue({ presence: [] });
    await expect(host.needs()).rejects.toThrow('attachment_stat_response_invalid');
  } finally { sqlite.close(); await rm(root, { recursive: true, force: true }); }
});

it('retains corrupt published bytes through failed replacement and marks only verified bytes available', async () => {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/companion-corrupt-'));
  const sqlite = new Database(path.join(root, 'library.db'));
  initializeDatabaseSchema(sqlite);
  const port = createBetterSqliteDbPort(sqlite);
  const bytes = Buffer.alloc(BLOCK + 19, 0x63), corrupt = Buffer.alloc(bytes.length, 0x64);
  const key = `${digest(bytes)}.png`, final = path.join(root, key);
  const resource = { storageKey: key, byteLength: bytes.length };
  native.access.mockImplementation(fileOperations(root));
  try {
    await writeFile(final, corrupt);
    const host = await createCompanionAttachmentHost({ files: createDesktopFramedSyncFiles(path.join(root, 'transport')),
      readSnapshot: read => read(port), write: write => write(port)
    }, { library_key: root, generation_id: 'generation' });
    expect(await host.status(resource)).toEqual({ kind: 'partial', offset: 0 });
    await host.receive(resource, 0, corrupt.subarray(0, BLOCK));
    expect(await readFile(final)).toEqual(corrupt);
    await expect(host.receive(resource, BLOCK, bytes.subarray(BLOCK))).rejects.toThrow('attachment_checksum_mismatch');
    expect(await readFile(final)).toEqual(corrupt);
    expect(sqlite.prepare('SELECT available FROM framed_sync_resource_availability').pluck().get()).toBe(0);
    await host.receive(resource, 0, bytes.subarray(0, BLOCK));
    expect(await readFile(final)).toEqual(corrupt);
    await host.receive(resource, BLOCK, bytes.subarray(BLOCK));
    expect(await readFile(final)).toEqual(bytes);
    expect(sqlite.prepare('SELECT available FROM framed_sync_resource_availability').pluck().get()).toBe(1);
  } finally { sqlite.close(); await rm(root, { recursive: true, force: true }); }
});

it('verifies companion source bytes in the shared core and rejects corruption after reuse', async () => {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/companion-source-'));
  const sqlite = new Database(path.join(root, 'library.db'));
  const port = createBetterSqliteDbPort(sqlite);
  const bytes = Buffer.alloc(4 * BLOCK + 19, 0x63), key = `${digest(bytes)}.png`;
  let reads = 0;
  const operations = fileOperations(root);
  native.access.mockImplementation(async input => {
    if (input.action === 'source-read') reads += input.length;
    return operations(input);
  });
  try {
    await writeFile(path.join(root, key), bytes);
    const host = await createCompanionAttachmentHost({ files: createDesktopFramedSyncFiles(path.join(root, 'transport')),
      readSnapshot: read => read(port), write: write => write(port)
    }, { library_key: root, generation_id: 'generation' });
    await expect(host.withFile(key, async () => { throw new Error('Must not send before full verification'); },
      { shouldYield: () => true })).rejects.toThrow('attachment_verification_pending');
    expect(reads).toBe(BLOCK);
    await host.withFile(key, async file => { expect(await file.read(BLOCK, BLOCK)).toEqual(new Uint8Array(bytes.subarray(BLOCK, 2 * BLOCK))); });
    expect(reads).toBe(bytes.length + BLOCK);
    await host.withFile(key, async file => { await file.read(0, BLOCK); });
    expect(reads).toBe(bytes.length + 2 * BLOCK);
    bytes[0] = 0;
    await writeFile(path.join(root, key), bytes);
    await expect(host.withFile(key, file => file.read(0, BLOCK))).rejects.toThrow('attachment_source_invalid');
  } finally { sqlite.close(); await rm(root, { recursive: true, force: true }); }
});

it('receives a prepared next file while the native file executor is occupied by the previous hash', async () => {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/attachment-image-'));
  const sqlite = new Database(path.join(root, 'library.db'));
  initializeDatabaseSchema(sqlite);
  const port = createBetterSqliteDbPort(sqlite);
  const bytes = [Buffer.alloc(1013, 0x31), Buffer.alloc(1019, 0x32)];
  const resources = bytes.map(value => ({ storageKey: `${digest(value)}.png`, byteLength: value.length }));
  await seedAttachmentReferences(sqlite, resources.map(resource => resource.storageKey));
  let release = () => {}, entered = false;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let tail: Promise<unknown> = Promise.resolve();
  const execute = fileOperations(root);
  native.access.mockImplementation((input: NativeCompanionFramedFileRequest) => {
    const operation = tail.then(async () => {
      if (input.operation === 'attachment' && input.action === 'source-stat-batch') {
        return { presence: resources.map(() => false) };
      }
      if (input.operation === 'attachment' && input.action === 'hash' && input.key === resources[0]!.storageKey.slice(0, 64)) {
        entered = true; await blocked;
      }
      return execute(input);
    });
    tail = operation.catch(() => undefined);
    return operation;
  });
  const host = await createCompanionAttachmentHost({ files: createDesktopFramedSyncFiles(path.join(root, 'transport')),
    readSnapshot: read => read(port), write: write => write(port) }, { library_key: root, generation_id: 'generation' });
  await host.needsSlice(() => false);
  for (const resource of resources) await host.status(resource);
  const session = await host.openReceiveSession!({ shouldYield: () => false });
  const receive = (index: number) => session.receiveWindow(resources[index]!, 0, async () => {
    await appendFile(path.join(root, `.attachment-${resources[index]!.storageKey.slice(0, 64)}.partial`), bytes[index]!);
    return { offset: bytes[index]!.length, blocks: 1, pending: false };
  });
  let next: Promise<unknown> | undefined;
  try {
    await receive(0);
    await waitFor(() => expect(entered).toBe(true));
    next = receive(1);
    await waitFor(async () => expect(await readFile(path.join(root, `.attachment-${resources[1]!.storageKey.slice(0, 64)}.partial`))).toEqual(bytes[1]));
    expect(existsSync(path.join(root, resources[0]!.storageKey))).toBe(false);
    expect(sqlite.prepare('SELECT count(*) FROM attachment_pending').pluck().get()).toBe(2);
    release(); await next;
    await Promise.all(resources.map(resource => session.settled(resource.storageKey)));
    expect(sqlite.prepare('SELECT count(*) FROM attachment_pending').pluck().get()).toBe(0);
    expect(sqlite.prepare('SELECT available FROM framed_sync_resource_availability').pluck().all()).toEqual([1, 1]);
    for (const [index, resource] of resources.entries()) expect(await readFile(path.join(root, resource.storageKey))).toEqual(bytes[index]);
  } finally { release(); await next; await session.close(); sqlite.close(); await rm(root, { recursive: true, force: true }); }
});
