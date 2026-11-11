// @vitest-environment node
import { once } from 'node:events';

import { expect, it, vi } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { runWebDavRelayBodyRound } from '../../lib/core/sync/webDavRelayBodyRound.js';
import { readWebDavRelayBodyScope } from '../../lib/core/sync/webDavRelayBodyScope.js';
import { captureWebDavRelayLanBaseline } from '../../lib/core/sync/webDavRelayLanBaseline.js';
import { webDavRelayStatus } from '../../lib/core/sync/webDavRelayPublication.js';
import { createWebDavSendWindow } from '../../lib/core/sync/webDavSendWindow.js';
import type { WebDavRelayBinding } from '../../lib/platform/webDavRelayContract.js';
import { restoreFixture, type RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { createDesktopWebDavRelayHttp } from './desktopWebDavRelayHttp.js';
import { runDesktopWebDavRelayRound } from './desktopWebDavRelayRound.js';
import { setupDav } from './webDavRelayTransport.testSupport.js';

const shell = vi.hoisted(() => ({
  binding: null as WebDavRelayBinding | null,
  source: null as RestorePeer | null,
  connected: false,
  participating: true,
  key: Buffer.alloc(32, 7)
}));

vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ dbPath: shell.source!.file }),
  runWithDatabaseConnectionOwner: async (run: () => unknown) => run()
}));
vi.mock('./desktopCompanionSyncPreference.js', () => ({ isDesktopCompanionSyncParticipating: () => shell.participating }));
vi.mock('./desktopWebDavRelaySettings.js', () => ({ loadDesktopBoundWebDavRelay: () => shell.binding }));
vi.mock('./desktopSyncChangeSessions.js', () => ({ desktopSyncChangeSessions: () => ({ hasSessions: () => shell.connected }) }));
vi.mock('./workgroupKeyStore.js', () => ({ loadDesktopWorkgroupKey: () => ({ group_key: shell.key.toString('base64url') }) }));
vi.mock('./desktopRequestSyncDatabaseHost.js', () => ({ createDesktopRequestSyncDatabaseHost: () => shell.source!.host }));
vi.mock('./desktopRequestSyncAttachmentHost.js', () => ({ createDesktopRequestSyncAttachmentHost: async () => undefined }));
vi.mock('./desktopFramedSyncFiles.js', async importOriginal => ({
  ...await importOriginal<typeof import('./desktopFramedSyncFiles.js')>(),
  createDesktopLibrarySyncFiles: () => shell.source!.host.files
}));
vi.mock('./desktopSyncActivityStore.js', () => ({ recordDesktopSyncActivity: async () => undefined }));

const stats = () => ({ requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0 });
const activity = { runId: 'automatic-dav', reason: 'automatic' as const, startedAt: new Date().toISOString() };

async function withAutomaticRelay(run: (args: Awaited<ReturnType<typeof prepare>> & {
  clock: ReturnType<typeof createWebDavSendWindow>;
  runs: Promise<boolean>[];
  tick: (ms: number) => Promise<void>;
  requestCount: () => number;
  dropNextMove: () => void;
  send: (signal: AbortSignal) => Promise<boolean>;
}) => Promise<void>) {
  const fixture = await restoreFixture();
  const dav = setupDav(process.env.FOLIOLE_TEST_WEBDAV_URL);
  let requests = 0;
  dav.server.on('request', () => requests++);
  const listening = once(dav.server, 'listening');
  dav.server.listen(0, '127.0.0.1');
  await listening;
  const clock = createWebDavSendWindow();
  try {
    const { source, target, binding } = await prepare(fixture, dav);
    const runs: Promise<boolean>[] = [];
    const send = (signal: AbortSignal) => {
      const result = runDesktopWebDavRelayRound(activity, signal);
      runs.push(result);
      return result;
    };
    const tick = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); };
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    await run({ source, target, binding, clock, runs, tick, requestCount: () => requests, dropNextMove: dav.dropNextMove, send });
  } finally {
    clock.stop();
    vi.useRealTimers();
    await new Promise<void>(resolve => dav.server.close(() => resolve()));
    await fixture.close();
    shell.binding = null;
    shell.source = null;
    shell.connected = false;
  }
}

it('publishes one bounded batch for continuous edits and makes no DAV requests while idle', async () => {
  await withAutomaticRelay(async ({ source, target, binding, clock, runs, tick, requestCount, send }) => {
    const initialRequests = requestCount();
    clock.start(send);
    await tick(60_000);
    expect(await runs[0]).toBe(false);
    expect(requestCount()).toBe(initialRequests);

    await write(source, 'first');
    clock.request();
    await tick(50_000);
    await write(source, 'second');
    clock.request();
    await tick(9_999);
    expect(requestCount()).toBe(initialRequests);
    await tick(1);
    expect(await runs[1]).toBe(true);
    expect(requestCount()).toBeGreaterThan(initialRequests);
    expect((await receive(target, binding)).applied).toBe(2);
    expect(body(target, 'first')).toBe('first');
    expect(body(target, 'second')).toBe('second');
    const after = requestCount();
    await tick(180_000);
    expect(requestCount()).toBe(after);
  });
});

it('keeps saved changes for a later startup when LAN or shutdown prevents DAV sending', async () => {
  await withAutomaticRelay(async ({ source, target, binding, clock, runs, tick, requestCount, send }) => {
    clock.start(send);
    await write(source, 'later');
    clock.request();
    const beforeLan = requestCount();
    shell.connected = true;
    await tick(60_000);
    expect(await runs[0]).toBe(false);
    expect(requestCount()).toBe(beforeLan);
    shell.connected = false;
    clock.request();
    await tick(59_999);
    clock.stop();
    await tick(1);
    expect(runs).toHaveLength(1);

    source.reopen();
    clock.start(send);
    await tick(60_000);
    expect(await runs[1]).toBe(true);
    expect((await receive(target, binding)).applied).toBe(1);
    target.reopen();
    expect(body(target, 'later')).toBe('later');
    expect((await receive(target, binding)).applied).toBe(0);
  });
});

it('automatically confirms a durable packet after the DAV connection drops during publication', async () => {
  await withAutomaticRelay(async ({ source, target, binding, clock, runs, tick, requestCount, dropNextMove, send }) => {
    clock.start(send);
    await write(source, 'retry-without-edit');
    clock.request();
    dropNextMove();
    await tick(60_000);
    await expect(runs[0]).rejects.toMatchObject({ code: 'ECONNRESET' });
    const failedAt = requestCount();
    await tick(59_999);
    expect(requestCount()).toBe(failedAt);
    await tick(1);
    expect(runs).toHaveLength(2);
    await expect(runs[1]).resolves.toBe(true);
    expect((await receive(target, binding)).applied).toBe(1);
    target.reopen();
    expect(body(target, 'retry-without-edit')).toBe('retry-without-edit');
    expect((await receive(target, binding)).applied).toBe(0);
    const completeAt = requestCount();
    await tick(300_000);
    expect(requestCount()).toBe(completeAt);
  });
});

async function prepare(fixture: Awaited<ReturnType<typeof restoreFixture>>, dav: ReturnType<typeof setupDav>) {
  const source = fixture.peer('source');
  const target = await fixture.companionPeer('target');
  const address = dav.server.address();
  if (!address || typeof address === 'string') throw new Error('missing DAV address');
  const directory = new URL(`http://127.0.0.1:${address.port}${dav.sandboxPath}${crypto.randomUUID()}/`);
  expect(await createDesktopWebDavRelayHttp(stats())(directory, { method: 'MKCOL' }, webDavRelayStatus)).toBe(201);
  const binding = { id: crypto.randomUUID(), group_id: 'group', desktop_device_id: source.id,
    phone_device_id: target.id, directory_url: directory.href };
  const context = { groupId: binding.group_id, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: source.id, initiatorLibraryEpoch: source.epoch,
    responderDeviceId: target.id, responderLibraryEpoch: target.epoch } as const;
  for (const [local, remote, role] of [[source, target, 'initiator'], [target, source, 'responder']] as const) {
    await local.db.run('INSERT OR IGNORE INTO node_version_device_revisions VALUES (?, ?, ?, 0, ?, NULL, ?)',
      ['group', remote.id, remote.epoch, 'baseline', new Date().toISOString()]);
    const confirm = await captureWebDavRelayLanBaseline(local.host, binding, context, role);
    expect(confirm).toBeDefined();
    await confirm!();
  }
  shell.binding = binding;
  shell.source = source;
  return { source, target, binding };
}

async function write(peer: RestorePeer, id: string) {
  const record = textBranch(`${id}-version`, id);
  await applySyncNodesWithDbPort(peer.db, [{ ...record, object_id: id, snapshot: { ...record.snapshot, id } }],
    { operation: 'local_mutation' });
}

function body(peer: RestorePeer, id: string) {
  return peer.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(id);
}

async function receive(peer: RestorePeer, binding: WebDavRelayBinding) {
  const scope = await readWebDavRelayBodyScope(peer.db, binding, peer.id);
  if (!scope) throw new Error('missing receiver baseline');
  return runWebDavRelayBodyRound({ host: { ...peer.host, enqueueSearchInvalidations: peer.desktop },
    files: peer.host.files, scope, groupKey: shell.key,
    request: createDesktopWebDavRelayHttp(stats()), lanConnected: () => true, assertScope: async () => {},
    progress: { published: 0, applied: 0, retries: 0 } });
}
