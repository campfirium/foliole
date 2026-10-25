// @vitest-environment node
import { readdir } from 'node:fs/promises';
import path from 'node:path';

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

import { closeDatabaseConnection, runWithDatabaseConnectionMaintenance } from '../../../../../../electron/database/connection.js';
import { pipelineFixture } from '../../../../../../electron/sync/attachmentPreparedPipeline.testSupport.js';
import { clearCompanionRequestNonceCache } from '../../../../../../electron/sync/companionRequestAuth.js';
import * as sources from '../../../../../../electron/sync/desktopAttachmentBlockSource.js';
import { clearDesktopSyncGroupMemberStateReadiness } from '../../../../../../electron/sync/desktopSyncGroupMemberStateReadiness.js';
import { requestAttachmentWorkYield } from '../../../../../../lib/core/sync/attachmentWorkBudget.js';
import { ATTACHMENT_WINDOW_BLOCKS } from '../../../../../../lib/core/sync/requestSyncAttachmentContract.js';
import { exchangeRequestSyncAttachments } from '../../../../../../lib/core/sync/requestSyncAttachmentExchange.js';

import { createCompanionRequestSyncExchange } from './companionRequestSyncExchange.js';

it('overlaps the first two preparations, replenishes during sends, and publishes a 64MiB file across bounded windows', async () => {
  const f = await pipelineFixture(createCompanionRequestSyncExchange, [Buffer.alloc(64 * 1024 * 1024 + 17, 0x73), ...[1, 2, 3, 4].map(i => Buffer.alloc(1024 + i, i))], root => {
    native.root = root; vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(root, 'target'));
  });
  native.sign.mockImplementation(f.sign);
  let active = 0, maxActive = 0, firstSend = true;
  let release = () => {};
  const second = new Promise<void>(resolve => { release = resolve; });
  const statuses: string[] = [];
  const host = { ...f.host, async status(...args: Parameters<typeof f.local.host.status>) {
    statuses.push(args[0].storageKey);
    if (statuses.length === 2) release();
    if (statuses.length === 1) await second;
    return f.local.host.status(...args);
  } };
  native.post.mockImplementation(async request => {
    if (!request.attachment_receive) return f.post(request);
    maxActive = Math.max(maxActive, ++active);
    try {
      if (firstSend) {
        firstSend = false;
        const before = f.signed.length;
        await vi.waitFor(() => expect(f.signed.length).toBeGreaterThan(before));
        expect(f.posted).toHaveLength(0);
      }
      // At most two waiting signed requests besides this active request.
      expect(f.signed.length - f.posted.length - 1).toBeLessThanOrEqual(2);
      return await f.post(request);
    } finally { active--; }
  });
  const failures: unknown[] = [];
  try {
    const result = await exchangeRequestSyncAttachments(host, f.exchange, (_key, error) => failures.push(error), () => false);
    expect(failures).toEqual([]);
    expect(result).toMatchObject({ transferred: 5, pending: 0 });
    expect(maxActive).toBe(1);
    expect(f.posted.filter(item => item.key === f.items[0]!.key).map(item => item.offset)).toEqual(Array.from({ length: 5 }, (_, i) => i * ATTACHMENT_WINDOW_BLOCKS * 512 * 1024));
    expect(await f.verify()).toEqual({ needs: [], available: [1, 1, 1, 1, 1] });
  } finally {
    release(); await f.close(); await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache(); vi.unstubAllEnvs(); await f.directory.remove();
  }
});

it.each(['yield', 'cancel'])('discards waiting signed requests on %s and resumes from the recovered persistent offset', async mode => {
  const controller = new AbortController();
  const f = await pipelineFixture(createCompanionRequestSyncExchange, [Buffer.alloc(20 * 1024 * 1024 + 19, 0x29), Buffer.alloc(1027, 0x30), Buffer.alloc(1029, 0x31)], root => {
    native.root = root; vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(root, 'target'));
  }, controller.signal);
  const exchange = f.exchange;
  native.sign.mockImplementation(f.sign);
  let requested = false, written = 0, postedAtCancel = 0;
  const stop = new AbortController();
  native.cancel.mockImplementation(async () => { stop.abort(); });
  native.post.mockImplementation(async request => {
    if (!request.attachment_receive) return f.post(request);
    try {
      return await f.post(request, { signal: stop.signal, afterAppend() {
        if (request.attachment_receive.storage_key !== f.items[0]!.key || ++written !== 2) return;
        postedAtCancel = f.posted.length;
        requested = true;
        if (mode === 'cancel') controller.abort(new Error('user_cancelled'));
        requestAttachmentWorkYield();
      } });
    } catch (error) {
      if (stop.signal.aborted) throw Object.assign(new Error('native_cancelled'), { code: 'E_ABORT' });
      throw error;
    }
  });
  const failures: unknown[] = [];
  try {
    const run = exchangeRequestSyncAttachments(f.host, exchange, (_key, error) => failures.push(error), () => requested);
    if (mode === 'cancel') await expect(run).rejects.toThrow('user_cancelled');
    else expect((await run).pending).toBeGreaterThan(0);
    expect(requested).toBe(true);
    expect(f.posted).toHaveLength(postedAtCancel);
    const sent = f.posted.find(post => post.key === f.items[0]!.key)!;
    const item = f.items.find(item => item.key === sent.key)!;
    const status = await f.local.host.status({ storageKey: item.key, byteLength: item.bytes.length });
    expect(status).toMatchObject({ kind: 'partial', offset: 512 * 1024 });
    expect(failures).toEqual([]);
    expect(await readdir(path.join(f.directory.root, 'SyncTransport/requests'))).toEqual([]);
    native.post.mockImplementation(request => f.post(request));
    const resumed = await exchangeRequestSyncAttachments(f.host, await f.resumeExchange(), (_key, error) => failures.push(error), () => false);
    expect(resumed.pending).toBe(0);
    expect(f.posted.filter(post => post.key === sent.key)[1]?.offset).toBe(status.offset);
    expect(await f.verify()).toEqual({ needs: [], available: [1, 1, 1] });
    expect(failures).toEqual([]);
  } finally {
    await f.close(); await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache(); vi.unstubAllEnvs(); await f.directory.remove();
  }
});

it('replaces a speculative window after a short response and resumes at the actual committed offset', async () => {
  const f = await pipelineFixture(createCompanionRequestSyncExchange, [Buffer.alloc(20 * 1024 * 1024 + 19, 0x45), Buffer.alloc(1013, 0x46)], root => {
    native.root = root; vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(root, 'target'));
  });
  const original = sources.createDesktopAttachmentBlockSource;
  let shortened = false;
  const spy = vi.spyOn(sources, 'createDesktopAttachmentBlockSource').mockImplementation((...args) => {
    const source = original(...args);
    return { withFile(key, consume, options) {
      return source.withFile(key, file => consume({ ...file, async read(offset, length) {
        const bytes = await file.read(offset, length);
        if (!shortened && offset === 512 * 1024) { shortened = true; requestAttachmentWorkYield(); }
        return bytes;
      } }), options);
    } };
  });
  native.sign.mockImplementation(f.sign);
  native.post.mockImplementation(request => f.post(request));
  // Native cancellation may race the authenticated short response that has already finished.
  native.cancel.mockResolvedValue(undefined);
  const failures: unknown[] = [];
  try {
    expect(await exchangeRequestSyncAttachments(f.host, f.exchange, (_key, error) => failures.push(error), () => false))
      .toMatchObject({ transferred: 2, pending: 0 });
    expect(shortened).toBe(true); expect(failures).toEqual([]);
    const windows = f.posted.filter(post => post.key === f.items[0]!.key);
    expect(windows[1]?.offset).toBe(1024 * 1024);
    expect(f.signed.some(post => post.offset === 16 * 1024 * 1024)).toBe(true);
    expect(windows.some(post => post.offset === 16 * 1024 * 1024)).toBe(false);
    expect(await f.verify()).toEqual({ needs: [], available: [1, 1] });
    expect(await readdir(path.join(f.directory.root, 'SyncTransport/requests'))).toEqual([]);
  } finally {
    spy.mockRestore(); await f.close(); await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache(); vi.unstubAllEnvs(); await f.directory.remove();
  }
});

it('keeps a preparation failure pending while completing the other files, then retries without losing demand', async () => {
  const f = await pipelineFixture(createCompanionRequestSyncExchange, [1, 2, 3].map(i => Buffer.alloc(1024 + i, 0x50 + i)), root => {
    native.root = root; vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(root, 'target'));
  });
  let rejected = false;
  native.sign.mockImplementation(async input => {
    const result = await f.sign(input);
    if (!rejected && f.signed.at(-1)?.key === f.items[1]!.key) {
      rejected = true; throw new Error('credential_read_failed');
    }
    return result;
  });
  native.post.mockImplementation(request => f.post(request));
  const failures: unknown[] = [];
  try {
    expect(await exchangeRequestSyncAttachments(f.host, f.exchange, (_key, error) => failures.push(error), () => false))
      .toMatchObject({ transferred: 2, pending: 1 });
    expect(failures).toHaveLength(1);
    expect(f.posted.some(post => post.key === f.items[1]!.key)).toBe(false);
    expect(await readdir(path.join(f.directory.root, 'SyncTransport/requests'))).toEqual([]);
    native.sign.mockImplementation(f.sign);
    expect(await exchangeRequestSyncAttachments(f.host, f.exchange, (_key, error) => failures.push(error), () => false))
      .toMatchObject({ transferred: 1, pending: 0 });
    expect(await f.verify()).toEqual({ needs: [], available: [1, 1, 1] });
  } finally {
    await f.close(); await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache(); vi.unstubAllEnvs(); await f.directory.remove();
  }
});

it('yields before dispatch without posting any waiting attachment request', async () => {
  const f = await pipelineFixture(createCompanionRequestSyncExchange, [1, 2, 3].map(i => Buffer.alloc(1024 + i, i)), root => {
    native.root = root; vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(root, 'target'));
  });
  native.sign.mockImplementation(f.sign); native.post.mockImplementation(request => f.post(request));
  let yielded = false;
  const host = { ...f.host, async status(...args: Parameters<typeof f.host.status>) {
    yielded = true;
    return f.host.status(...args);
  } };
  try {
    expect(await exchangeRequestSyncAttachments(host, f.exchange, (_key, error) => { throw error; }, () => yielded))
      .toMatchObject({ transferred: 0, pending: 3 });
    expect(f.posted).toEqual([]);
    expect(await readdir(path.join(f.directory.root, 'SyncTransport/requests'))).toEqual([]);
  } finally {
    await f.close(); await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache(); vi.unstubAllEnvs(); await f.directory.remove();
  }
});
