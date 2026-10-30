// @vitest-environment node
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ root: '', post: vi.fn(), sign: vi.fn(), cancel: vi.fn(), access: vi.fn() }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath: (name: string) => `${native.root}/host/${name}`, isPackaged: false
} }));
vi.mock('../../../companionWorkspaceRuntimeRepository.js', () => ({ FolioleCompanionSync: {
  postRequestSyncHttp: native.post, signCompanionSyncRequest: native.sign, cancelRequestSyncHttp: native.cancel,
  accessFramedSyncFile: native.access
} }));
vi.mock('../../runtime/companionFramedPayloadBudget.js', () => ({
  companionFramedFileOwner: () => ({ library_key: 'test', generation_id: 'test' })
}));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap.js', () => ({ getIosCompanionDatabaseOwner: () => ({}) }));

import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner, runWithDatabaseConnectionMaintenance } from '../../../../../../electron/database/connection.js';
import { pipelineFixture } from '../../../../../../electron/sync/attachmentPreparedPipeline.testSupport.js';
import { clearCompanionRequestNonceCache } from '../../../../../../electron/sync/companionRequestAuth.js';
import { clearDesktopSyncGroupMemberStateReadiness } from '../../../../../../electron/sync/desktopSyncGroupMemberStateReadiness.js';
import * as hashing from '../../../../../../electron/sync/resourceFileHash.js';
import { requestAttachmentWorkYield } from '../../../../../../lib/core/sync/attachmentWorkBudget.js';
import { exchangeRequestSyncAttachments } from '../../../../../../lib/core/sync/requestSyncAttachmentExchange.js';

import { createCompanionAttachmentHost } from './companionAttachmentBlockFiles.js';
import { companionAttachmentNativeFiles } from './companionAttachmentNativeFiles.testSupport.js';
import { deferPdfTextVerification } from './companionPdfTextVerification.testSupport.js';
import { createCompanionRequestSyncExchange } from './companionRequestSyncExchange.js';

type Fixture = Awaited<ReturnType<typeof pipelineFixture>>;

async function fixture(bytes: Buffer[], signal?: AbortSignal) {
  const f = await pipelineFixture(createCompanionRequestSyncExchange, bytes, root => {
    native.root = root; vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(root, 'target'));
  }, signal);
  native.cancel.mockResolvedValue(undefined);
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

async function verifyReopened(f: Fixture) {
  await f.reopenReceiver();
  expect(await f.verify()).toEqual({ needs: [], available: Array(67).fill(1) });
}
function orderedDemand(f: Fixture) {
  f.items.forEach((item, index) => f.local.sqlite.prepare(
    'UPDATE attachment_pending SET registered_at = ? WHERE storage_key = ?').run(String(index).padStart(4, '0'), item.key));
}
async function segmentedFixture(signal?: AbortSignal) {
  const f = await fixture([...Array.from({ length: 63 }, (_, i) => Buffer.alloc(1000 + i, i)),
    Buffer.alloc(20 * 1024 * 1024 + 17, 0x73), ...[65, 66, 67].map(i => Buffer.alloc(1000 + i, i))], signal);
  // Populate the existing durable queue once, then fix deterministic fairness timestamps.
  await f.host.needsSlice(() => false);
  orderedDemand(f);
  return f;
}

it('prepares and receives beyond the real 64-key boundary while its last multi-window file still hashes', async () => {
  const f = await segmentedFixture();
  const blocked = gate(), nextBlocked = gate();
  let hashingStarted = false, nextHashing = false, preparedDuringTransmission = false;
  let nextPrepared = false, sessions = 0, active = 0, maxActive = 0;
  const boundary = f.items[63]!, next = f.items[64]!;
  const original = hashing.hashResourceFile;
  vi.spyOn(hashing, 'hashResourceFile').mockImplementation(async file => {
    const hash = await original(file);
    if (path.basename(file) === `.attachment-${boundary.key.slice(0, 64)}.partial`) {
      hashingStarted = true; await blocked.promise;
    }
    if (path.basename(file) === `.attachment-${next.key.slice(0, 64)}.partial`) {
      nextHashing = true; await nextBlocked.promise;
    }
    return hash;
  });
  const selected: number[] = [];
  const host = { ...f.host, async needsSlice(...args: Parameters<typeof f.host.needsSlice>) {
    const demand = await f.host.needsSlice(...args); selected.push(demand.keys.length); return demand;
  }, async openReceiveSession(...args: Parameters<NonNullable<typeof f.host.openReceiveSession>>) {
    sessions++; return f.host.openReceiveSession!(...args);
  }, async status(...args: Parameters<typeof f.host.status>) {
    if (args[0].storageKey === next.key) nextPrepared = true;
    return f.host.status(...args);
  } };
  native.post.mockImplementation(async request => {
    if (!request.attachment_receive) return f.post(request);
    maxActive = Math.max(maxActive, ++active);
    if (request.attachment_receive.storage_key === boundary.key && request.attachment_receive.offset > 0) {
      preparedDuringTransmission = nextPrepared;
    }
    expect(f.signed.length - f.posted.length - 1).toBeLessThanOrEqual(2);
    try { return await f.post(request); } finally { active--; }
  });
  const failures: unknown[] = [];
  const run = exchangeRequestSyncAttachments(host, f.exchange, (_key, error) => failures.push(error), () => false);
  try {
    await vi.waitFor(() => {
      expect(hashingStarted).toBe(true);
      expect(nextPrepared, 'next segment preparation must not wait for boundary finalization').toBe(true);
      expect(f.posted.some(post => post.key === next.key), 'next segment must use the still-open receive session').toBe(true);
    }, { timeout: 8000 });
    expect(preparedDuringTransmission).toBe(true);
    await vi.waitFor(() => expect(nextHashing).toBe(true));
    expect(f.posted.some(post => post.key === f.items[65]!.key)).toBe(false);
    expect(persisted(f, boundary.key)).toEqual({ available: 0, pending: 1 });
    expect(sessions).toBe(1);
    blocked.release();
    await vi.waitFor(() => expect(f.posted.some(post => post.key === f.items[65]!.key)).toBe(true));
    expect(persisted(f, next.key)).toEqual({ available: 0, pending: 1 });
    nextBlocked.release();
    expect(await run).toMatchObject({ transferred: 67, pending: 0 });
    expect(selected[0]).toBe(64); expect(Math.max(...selected)).toBe(64);
    expect(maxActive).toBe(1); expect(failures).toEqual([]);
    expect(f.posted.filter(post => post.key === boundary.key).map(post => post.offset)).toEqual([0, 16 * 1024 * 1024]);
    expect(f.posted).toHaveLength(68);
    await verifyReopened(f);
  } finally { blocked.release(); nextBlocked.release(); await run.catch(() => {}); await cleanup(f); }
});

it.each([
  { mode: 'yield', prefetch: true }, { mode: 'cancel', prefetch: true },
  { mode: 'yield', prefetch: false }, { mode: 'cancel', prefetch: false }, { mode: 'failure', prefetch: false }
])('recovers next-segment $mode with metadata prefetch=$prefetch without duplicate receipts', async ({ mode, prefetch }) => {
  const controller = new AbortController();
  const f = await segmentedFixture(controller.signal);
  let stopped = false, triggered = false;
  const next = f.items[64]!;
  const stop = () => {
    stopped = true;
    if (mode === 'cancel') controller.abort(new Error('user_cancelled'));
    requestAttachmentWorkYield();
  };
  const host = { ...f.host, async needsSlice(...args: Parameters<typeof f.host.needsSlice>) {
    const demand = await f.host.needsSlice(...args);
    if (prefetch && args[1] && !triggered) { triggered = true; stop(); }
    return demand;
  } };
  native.sign.mockImplementation(async input => {
    const signed = await f.sign(input);
    if (!prefetch && !triggered && f.signed.at(-1)?.key === next.key) {
      triggered = true;
      if (mode === 'failure') throw new Error('credential_read_failed');
      stop();
    }
    return signed;
  });
  const failures: unknown[] = [];
  try {
    const run = exchangeRequestSyncAttachments(host, f.exchange, (_key, error) => failures.push(error), () => stopped);
    if (mode === 'cancel') await expect(run).rejects.toThrow('user_cancelled');
    else expect((await run).pending).not.toBe(0);
    expect(triggered).toBe(true);
    expect(failures).toHaveLength(mode === 'failure' ? 1 : 0);
    const completed = f.items.filter(item => persisted(f, item.key).available === 1).map(item => item.key);
    expect(completed.length).toBeGreaterThan(0);
    expect(persisted(f, next.key)).toEqual({ available: 0, pending: 1 });
    expect(await readdir(path.join(f.directory.root, 'SyncTransport/requests'))).toEqual([]);
    const postedBefore = f.posted.length;
    await f.reopenReceiver();
    stopped = false; native.sign.mockImplementation(f.sign);
    expect(await exchangeRequestSyncAttachments(f.host, await f.resumeExchange(), (_key, error) => failures.push(error), () => false))
      .toMatchObject({ pending: 0 });
    expect(f.posted.slice(postedBefore).some(post => completed.includes(post.key))).toBe(false);
    expect(await f.verify()).toEqual({ needs: [], available: Array(67).fill(1) });
  } finally { await cleanup(f); }
});

it.each([3, 65])('imports PDF text across the boundary and persists every page after %i verification yields', async deferrals => {
  const f = await segmentedFixture();
  const pages = f.items.map((item, index) => index === 64 ? 'x'.repeat(deferrals > 64 ? 32 * 1024 : 17 * 1024 * 1024) : item.key);
  native.post.mockImplementation(request => {
    if (request.attachment_receive) expect(f.signed.length - f.posted.length - 1).toBeLessThanOrEqual(2);
    return f.post(request);
  });
  await runWithDatabaseConnectionOwner(() => {
    const { sqlite } = openDatabaseConnection();
    for (const [index, item] of f.items.entries()) {
      sqlite.prepare("INSERT INTO pdf_index_state(attachment_id, status, version) VALUES (?, 'ready', 1)").run(item.key.slice(0, 64));
      sqlite.prepare('INSERT INTO pdf_page_text(attachment_id, page, text) VALUES (?, 1, ?)').run(item.key.slice(0, 64), pages[index]);
    }
  });
  native.access.mockImplementation(companionAttachmentNativeFiles(f.local.assetsDir));
  const host = await createCompanionAttachmentHost(f.local.database,
    { library_key: f.directory.root, generation_id: 'pdf-text' });
  const failures: unknown[] = [];
  try {
    const deferred = deferPdfTextVerification(deferrals);
    const run = () => exchangeRequestSyncAttachments(host, f.exchange, (_key, error) => failures.push(error), () => false);
    const result = await run();
    if (deferrals > 64) {
      expect(result).toMatchObject({ transferred: 133, pending: 1, yielded: true });
      expect(f.local.sqlite.prepare('SELECT count(*) FROM attachment_pending').pluck().get()).toBe(1);
      expect(f.local.sqlite.prepare('SELECT count(*) FROM pdf_text_artifact').pluck().get()).toBe(66);
      expect(await run()).toMatchObject({ transferred: 1, pending: 0 });
    } else expect(result).toMatchObject({ transferred: 134, pending: 0 });
    expect(deferred()).toBe(deferrals);
    expect(failures).toEqual([]);
    await f.reopenReceiver();
    expect(f.local.sqlite.prepare('SELECT text FROM pdf_page_text ORDER BY text').pluck().all())
      .toEqual([...pages].sort());
    expect(f.local.sqlite.prepare('SELECT count(*) FROM pdf_text_artifact').pluck().get()).toBe(67);
    expect(await f.verify()).toEqual({ needs: [], available: Array(134).fill(1) });
  } finally { await cleanup(f); }
});
