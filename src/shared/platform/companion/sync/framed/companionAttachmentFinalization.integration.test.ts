// @vitest-environment node
import { readFile, stat, access } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ root: '', post: vi.fn(), sign: vi.fn(), cancel: vi.fn() }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath: (name: string) => `${native.root}/host/${name}`, isPackaged: false
} }));
vi.mock('../../../companionWorkspaceRuntimeRepository.js', () => ({ FolioleCompanionSync: {
  postRequestSyncHttp: native.post, signCompanionSyncRequest: native.sign, cancelRequestSyncHttp: native.cancel
} }));
vi.mock('../../runtime/companionFramedPayloadBudget.js', () => ({
  companionFramedFileOwner: () => ({ library_key: 'test', generation_id: 'test' })
}));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap.js', () => ({ getIosCompanionDatabaseOwner: () => ({}) }));

import * as published from '../../../../../../electron/attachments/attachmentPublishedEvents.js';
import { closeDatabaseConnection, runWithDatabaseConnectionMaintenance } from '../../../../../../electron/database/connection.js';
import { pipelineFixture } from '../../../../../../electron/sync/attachmentPreparedPipeline.testSupport.js';
import { clearCompanionRequestNonceCache } from '../../../../../../electron/sync/companionRequestAuth.js';
import { clearDesktopSyncGroupMemberStateReadiness } from '../../../../../../electron/sync/desktopSyncGroupMemberStateReadiness.js';
import * as hashing from '../../../../../../electron/sync/resourceFileHash.js';
import { requestAttachmentWorkYield } from '../../../../../../lib/core/sync/attachmentWorkBudget.js';
import { exchangeRequestSyncAttachments } from '../../../../../../lib/core/sync/requestSyncAttachmentExchange.js';

import { createCompanionRequestSyncExchange } from './companionRequestSyncExchange.js';

type Fixture = Awaited<ReturnType<typeof pipelineFixture>>;

async function fixture(bytes: Buffer[], signal?: AbortSignal) {
  const f = await pipelineFixture(createCompanionRequestSyncExchange, bytes, root => {
    native.root = root; vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(root, 'target'));
  }, signal);
  native.sign.mockImplementation(f.sign);
  native.post.mockImplementation(request => f.post(request));
  return f;
}
async function cleanup(f: Fixture) {
  vi.restoreAllMocks();
  await f.close(); await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
  clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache(); vi.unstubAllEnvs(); await f.directory.remove();
}
function gate() {
  let release = () => {};
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
function persisted(f: Fixture, key: string) {
  const db = new Database(f.local.databasePath, { readonly: true });
  try {
    return { available: db.prepare('SELECT available FROM framed_sync_resource_availability WHERE hash = ?').pluck().get(key.slice(0, 64)),
      pending: db.prepare('SELECT count(*) FROM attachment_pending WHERE storage_key = ?').pluck().get(key) };
  } finally { db.close(); }
}

it('writes B while A hashes, applies two-file backpressure, and waits for durable finalization before returning', async () => {
  const f = await fixture([Buffer.alloc(64 * 1024 * 1024 + 17, 0x61), ...[2, 3, 4].map(i => Buffer.alloc(1000 + i, i))]);
  const gates = [gate(), gate()];
  const started = new Set<string>();
  const original = hashing.hashResourceFile;
  vi.spyOn(hashing, 'hashResourceFile').mockImplementation(async file => {
    const hash = await original(file);
    const index = f.items.findIndex(item => path.basename(file) === `.attachment-${item.key.slice(0, 64)}.partial`);
    if (index >= 0 && index < 2) { started.add(f.items[index]!.key); await gates[index]!.promise; }
    return hash;
  });
  const failures: unknown[] = [];
  const notifications: unknown[] = [];
  vi.spyOn(published, 'notifyAttachmentPublished').mockImplementation(key => { notifications.push(persisted(f, key)); });
  let returned = false;
  const run = exchangeRequestSyncAttachments(f.host, f.exchange, (_key, error) => failures.push(error), () => false)
    .then(result => { returned = true; return result; });
  try {
    await vi.waitFor(() => expect(started.size, 'B must reach its real hash while A remains blocked').toBe(2));
    const [a, b, c] = f.items;
    expect((await stat(path.join(f.local.assetsDir, `.attachment-${b!.key.slice(0, 64)}.partial`))).size).toBe(b!.bytes.length);
    expect(persisted(f, a!.key)).toEqual({ available: 0, pending: 1 });
    await expect(access(path.join(f.local.assetsDir, a!.key))).rejects.toThrow();
    expect(f.posted.some(post => post.key === c!.key)).toBe(false);
    expect(returned).toBe(false);
    gates[0]!.release();
    await vi.waitFor(() => expect(f.posted.some(post => post.key === c!.key)).toBe(true));
    expect(persisted(f, b!.key)).toEqual({ available: 0, pending: 1 });
    expect(returned).toBe(false);
    gates[1]!.release();
    expect(await run).toMatchObject({ transferred: 4, pending: 0 });
    expect(failures).toEqual([]);
    expect(notifications).toEqual(Array.from({ length: 4 }, () => ({ available: 1, pending: 0 })));
    expect(await f.verify()).toEqual({ needs: [], available: [1, 1, 1, 1] });
  } finally { gates.forEach(g => g.release()); await run.catch(() => {}); await cleanup(f); }
});

it('reports a real hash mismatch, preserves completed files and demand, and retries after reopening the receiver', async () => {
  const f = await fixture([1, 2, 3].map(i => Buffer.alloc(1100 + i, i)));
  let corrupted = false;
  native.post.mockImplementation(request => f.post(request, { afterAppend() {
    if (request.attachment_receive?.storage_key === f.items[1]!.key) corrupted = true;
  } }));
  const original = hashing.hashResourceFile;
  // Corrupt the actual partial before running the production streaming hash.
  vi.spyOn(hashing, 'hashResourceFile').mockImplementation(async file => {
    if (corrupted && path.basename(file) === `.attachment-${f.items[1]!.key.slice(0, 64)}.partial`) {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(file, Buffer.alloc(f.items[1]!.bytes.length, 0xff));
    }
    return original(file);
  });
  const failures: unknown[] = [];
  try {
    expect(await exchangeRequestSyncAttachments(f.host, f.exchange, (_key, error) => failures.push(error), () => false))
      .toMatchObject({ transferred: 2, pending: 1 });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ message: 'attachment_checksum_mismatch' });
    expect(persisted(f, f.items[1]!.key)).toEqual({ available: 0, pending: 1 });
    await expect(access(path.join(f.local.assetsDir, f.items[1]!.key))).rejects.toThrow();
    expect(await readFile(path.join(f.local.assetsDir, f.items[0]!.key))).toEqual(f.items[0]!.bytes);
    vi.restoreAllMocks();
    await f.reopenReceiver();
    expect(await exchangeRequestSyncAttachments(f.host, await f.resumeExchange(), (_key, error) => failures.push(error), () => false))
      .toMatchObject({ transferred: 1, pending: 0 });
    expect(await f.verify()).toEqual({ needs: [], available: [1, 1, 1] });
  } finally { await cleanup(f); }
});

it.each(['yield', 'cancel'])('drains a blocked native hash on %s without stale publication and recovers after reopening', async mode => {
  const controller = new AbortController();
  const f = await fixture([1, 2, 3].map(i => Buffer.alloc(1200 + i, i)), controller.signal);
  const blocked = gate();
  let stopped = false, hashingStarted = false, returned = false;
  const original = hashing.hashResourceFile;
  vi.spyOn(hashing, 'hashResourceFile').mockImplementation(async file => {
    const hash = await original(file);
    if (path.basename(file) === `.attachment-${f.items[1]!.key.slice(0, 64)}.partial`) {
      hashingStarted = true; await blocked.promise;
    }
    return hash;
  });
  const failures: unknown[] = [];
  const run = exchangeRequestSyncAttachments(f.host, f.exchange, (_key, error) => failures.push(error), () => stopped);
  const settled = run.then(value => ({ value }), (error: unknown) => ({ error })).finally(() => { returned = true; });
  try {
    await vi.waitFor(() => expect(hashingStarted).toBe(true));
    await vi.waitFor(() => expect(persisted(f, f.items[0]!.key).available).toBe(1));
    stopped = true;
    if (mode === 'cancel') controller.abort(new Error('user_cancelled'));
    requestAttachmentWorkYield();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(returned, 'the stream must retain the lease while the native hash is using it').toBe(false);
    blocked.release();
    const result = await settled;
    if (mode === 'cancel') expect(result).toMatchObject({ error: { message: 'user_cancelled' } });
    else expect(result).toMatchObject({ value: { pending: expect.any(Number) } });
    expect(persisted(f, f.items[1]!.key)).toEqual({ available: 0, pending: 1 });
    await expect(access(path.join(f.local.assetsDir, f.items[1]!.key))).rejects.toThrow();
    expect(failures).toEqual([]);
    vi.restoreAllMocks();
    await f.reopenReceiver();
    expect(await exchangeRequestSyncAttachments(f.host, await f.resumeExchange(), (_key, error) => failures.push(error), () => false))
      .toMatchObject({ pending: 0 });
    expect(await f.verify()).toEqual({ needs: [], available: [1, 1, 1] });
  } finally { blocked.release(); await settled; await cleanup(f); }
});
