// @vitest-environment node
import { once } from 'node:events';

import { expect, it, vi } from 'vitest';

import { restoreFixture, type RestorePeer } from '../../../../../electron/database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../../../../../electron/database/topicTextState.testSupport.js';
import { createDesktopWebDavRelayHttp } from '../../../../../electron/sync/desktopWebDavRelayHttp.js';
import { setupDav } from '../../../../../electron/sync/webDavRelayTransport.testSupport.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../lib/core/sync/framedSyncContract.js';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor.js';
import { runWebDavRelayBodyRound } from '../../../../../lib/core/sync/webDavRelayBodyRound.js';
import { readWebDavRelayBodyScope } from '../../../../../lib/core/sync/webDavRelayBodyScope.js';
import { captureWebDavRelayLanBaseline } from '../../../../../lib/core/sync/webDavRelayLanBaseline.js';
import { webDavRelayStatus } from '../../../../../lib/core/sync/webDavRelayPublication.js';
import { createWebDavSendWindow } from '../../../../../lib/core/sync/webDavSendWindow.js';
import type { WebDavRelayBinding } from '../../../../../lib/platform/webDavRelayContract.js';

import { runCompanionWebDavRelayRound } from './companionWebDavRelayRound.js';
import { loadCompanionWebDavRelay, receiveCompanionWebDavRelay } from './companionWebDavRelayStore.js';

const mobile = vi.hoisted(() => ({
  phone: undefined as RestorePeer | undefined,
  key: Buffer.alloc(32, 7)
}));
vi.mock('../../companionRuntimeCapabilities.js', () => ({ getCompanionRuntimeCapability: () => ({ kind: 'android-native' }) }));
vi.mock('../network/companionDesktopSession.js', () => ({ companionDesktopSessionId: () => null }));
vi.mock('../runtime/companionFramedPayloadBudget.js', () => ({ companionFramedFileOwner: () => ({}) }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap.js', () => ({
  getIosCompanionDatabaseOwner: () => ({
    read: (run: (db: RestorePeer['db']) => unknown) => run(mobile.phone!.db),
    runWriter: (run: (db: RestorePeer['db']) => unknown) => run(mobile.phone!.db)
  })
}));
vi.mock('./framed/companionFramedSyncFiles.js', () => ({
  currentCompanionFramedSyncFiles: () => mobile.phone!.host.files
}));
vi.mock('./framed/companionRequestSyncDatabaseHost.js', () => ({
  currentCompanionRequestSyncDatabaseHost: async () => ({ ...mobile.phone!.host, enqueueSearchInvalidations: false })
}));
vi.mock('./framed/companionAttachmentBlockFiles.js', () => ({ currentCompanionAttachmentHost: async () => undefined }));
vi.mock('./framed/companionRequestSyncLifecycle.js', () => ({
  withCompanionRequestSyncLifecycle: (run: (signal: AbortSignal) => unknown, signal: AbortSignal) => run(signal)
}));
vi.mock('./companionWebDavRelayHttp.js', async () => {
  const { createDesktopWebDavRelayHttp } = await import('../../../../../electron/sync/desktopWebDavRelayHttp.js');
  return { createCompanionWebDavRelayHttp: (_root: unknown, _files: unknown, _owner: unknown,
    metrics: ReturnType<typeof stats>, signal: AbortSignal) => createDesktopWebDavRelayHttp(metrics, signal) };
});
vi.mock('./syncGroupProviderCredentialStore.js', () => ({ loadCurrentCredential: async () => ({
  device_id: mobile.phone!.id, workgroup_key: mobile.key.toString('base64url')
}) }));

const stats = () => ({ requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0 });
const progress = () => ({ published: 0, applied: 0, retries: 0 });

it('retains Android edits while away and sends once after foreground recovery, including after reopening the library', async () => {
  const fixture = await restoreFixture();
  const dav = setupDav(process.env.FOLIOLE_TEST_WEBDAV_URL);
  const listening = once(dav.server, 'listening');
  dav.server.listen(0, '127.0.0.1');
  await listening;
  const clock = createWebDavSendWindow();
  try {
    const desktop = fixture.peer('source');
    const phone = await fixture.companionPeer('target');
    mobile.phone = phone;
    const binding = await prepareBinding(desktop, phone, dav);
    let requests = 0;
    let publications = 0;
    dav.server.on('request', request => { requests++; if (request.method === 'MOVE') publications++; });
    const attempts: Promise<unknown>[] = [];
    const send = (signal: AbortSignal) => {
      const attempt = sendPending(signal);
      attempts.push(attempt);
      return attempt;
    };
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    clock.start(send);
    await vi.advanceTimersByTimeAsync(60_000);
    await attempts[0];
    expect(requests).toBe(0);

    await save(phone, 'foreground-edit');
    clock.request();
    await vi.advanceTimersByTimeAsync(10_000);
    clock.setActive(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(requests).toBe(0);
    clock.setActive(true);
    await vi.advanceTimersByTimeAsync(1);
    await attempts[1];
    expect(publications).toBe(1);
    await expect(readDesktop(desktop, binding, 'foreground-edit')).resolves.toBe(1);

    await recoverAfterDisconnect({ phone, desktop, binding, clock, dav, attempts, counts: () => ({ requests, publications }) });

    await save(phone, 'cold-start-edit');
    clock.request();
    clock.stop();
    phone.reopen();
    expect(await loadCompanionWebDavRelay(true)).toEqual(binding);
    clock.start(send);
    await vi.advanceTimersByTimeAsync(60_000);
    await attempts[4];
    expect(publications).toBe(3);
    await expect(readDesktop(desktop, binding, 'cold-start-edit')).resolves.toBe(1);
    desktop.reopen();
    await expect(readDesktop(desktop, binding, 'cold-start-edit')).resolves.toBe(0);
    expect(await loadCompanionWebDavRelay(true)).toBeNull();
  } finally {
    clock.stop();
    vi.useRealTimers();
    await new Promise<void>(resolve => dav.server.close(() => resolve()));
    await fixture.close();
    mobile.phone = undefined;
  }
});

async function recoverAfterDisconnect({ phone, desktop, binding, clock, dav, attempts, counts }: {
  phone: RestorePeer;
  desktop: RestorePeer;
  binding: WebDavRelayBinding;
  clock: ReturnType<typeof createWebDavSendWindow>;
  dav: ReturnType<typeof setupDav>;
  attempts: Promise<unknown>[];
  counts: () => { requests: number; publications: number };
}) {
  await save(phone, 'recover-after-disconnect');
  clock.request();
  dav.dropNextMove();
  await vi.advanceTimersByTimeAsync(60_000);
  await expect(attempts[2]).rejects.toMatchObject({ code: 'ECONNRESET' });
  const afterFailure = counts().requests;
  clock.setActive(false);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(counts().requests).toBe(afterFailure);
  clock.setActive(true);
  await vi.advanceTimersByTimeAsync(1);
  await attempts[3];
  expect(counts().publications).toBe(2);
  await expect(readDesktop(desktop, binding, 'recover-after-disconnect')).resolves.toBe(1);
}

async function prepareBinding(desktop: RestorePeer, phone: RestorePeer, dav: ReturnType<typeof setupDav>) {
  const address = dav.server.address();
  if (!address || typeof address === 'string') throw Error('missing DAV address');
  const directory = new URL(`http://127.0.0.1:${address.port}${dav.sandboxPath}${crypto.randomUUID()}/`);
  expect(await createDesktopWebDavRelayHttp(stats())(directory, { method: 'MKCOL' }, webDavRelayStatus)).toBe(201);
  const binding = { id: crypto.randomUUID(), group_id: 'group', desktop_device_id: desktop.id,
    phone_device_id: phone.id, directory_url: directory.href };
  const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, initiatorDeviceId: desktop.id,
    initiatorLibraryEpoch: desktop.epoch, responderDeviceId: phone.id, responderLibraryEpoch: phone.epoch } as const;
  for (const [local, remote, role] of [[desktop, phone, 'initiator'], [phone, desktop, 'responder']] as const) {
    await local.db.run('INSERT OR IGNORE INTO node_version_device_revisions VALUES (?, ?, ?, 0, ?, NULL, ?)',
      ['group', remote.id, remote.epoch, 'baseline', new Date().toISOString()]);
    const confirm = await captureWebDavRelayLanBaseline(local.host, binding, context, role);
    expect(confirm).toBeDefined();
    await confirm!();
  }
  expect(await receiveCompanionWebDavRelay(binding, desktop.id)).toBe(binding.id);
  return binding;
}

async function sendPending(signal: AbortSignal) {
  const binding = await loadCompanionWebDavRelay(true);
  if (binding) await runCompanionWebDavRelayRound(binding, stats(), progress(), signal);
}

async function save(phone: RestorePeer, id: string) {
  const record = textBranch(`${id}-version`, id);
  await applySyncNodesWithDbPort(phone.db, [{ ...record, object_id: id, snapshot: { ...record.snapshot, id } }],
    { operation: 'local_mutation', enqueueSearchInvalidations: false });
}

async function readDesktop(peer: RestorePeer, binding: WebDavRelayBinding, id: string) {
  const scope = await readWebDavRelayBodyScope(peer.db, binding, peer.id);
  if (!scope) throw Error('missing LAN baseline');
  const result = await runWebDavRelayBodyRound({ host: { ...peer.host, enqueueSearchInvalidations: true },
    files: peer.host.files, scope, groupKey: mobile.key, request: createDesktopWebDavRelayHttp(stats()),
    lanConnected: () => true, assertScope: async () => {}, progress: progress() });
  expect(peer.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(id)).toBe(id);
  return result.applied;
}
