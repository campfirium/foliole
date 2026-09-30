// @vitest-environment node
import { AsyncLocalStorage } from 'node:async_hooks';
import { promises as fs } from 'node:fs';

import { expect, it, vi } from 'vitest';

import { publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { openDatabaseConnection, type DatabaseConnection } from '../database/connection.js';
import { mockedSyncPackBuilderAppDataDir, setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { openContinuationReceiver, prepareArticleContinuation, readArticleContinuationState,
  receiverAttachmentPath, writeArticleContinuationEvidence } from './desktopResourceArticleContinuation.testSupport.js';
import { markDesktopSyncGroupMemberStateReady,
  revokeDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import { drainDesktopSyncGroupResourceArticles } from './desktopSyncGroupResourceArticleDrain.js';
import { hashResourceFile } from './resourceAvailability.js';

interface ReceiverScope { connection: DatabaseConnection; assetsDir: string; }
const fixture = vi.hoisted(() => ({
  routing: null as AsyncLocalStorage<ReceiverScope> | null,
  ids: {
    source: JSON.stringify([1, 'group', '11111111-1111-4111-8111-111111111111', '/source']),
    receiver: JSON.stringify([1, 'group', '22222222-2222-4222-8222-222222222222', '/receiver'])
  }
}));
// Isolate the application singleton bootstrap; both contexts retain real SQLite drivers and ports.
vi.mock('../database/connection.js', async (original) => {
  const actual = await original<typeof import('../database/connection.js')>();
  return { ...actual,
    openDatabaseConnection: () => fixture.routing?.getStore()?.connection ?? actual.openDatabaseConnection(),
    runWithDatabaseConnectionOwner<T>(task: () => T | Promise<T>) {
      return fixture.routing?.getStore() ? Promise.resolve().then(task) : actual.runWithDatabaseConnectionOwner(task);
    }
  };
});
vi.mock('../attachments/attachmentLibraryPathSnapshot.js', async (original) => {
  const actual = await original<typeof import('../attachments/attachmentLibraryPathSnapshot.js')>();
  return { ...actual, readAttachmentLibraryPathSnapshot: () => {
    const scope = fixture.routing?.getStore();
    return scope ? { assetsDir: scope.assetsDir, libraryScope: 'receiver' } : actual.readAttachmentLibraryPathSnapshot();
  } };
});
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: mockedSyncPackBuilderAppDataDir + '/cache',
  app_config_dir: mockedSyncPackBuilderAppDataDir + '/config',
  app_log_dir: mockedSyncPackBuilderAppDataDir + '/logs'
}) }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({
  group_id: 'group', local_device_identity_key: fixture.routing?.getStore() ? fixture.ids.receiver : fixture.ids.source,
  devices: [{ device_identity_key: fixture.ids.source, state: 'active' },
    { device_identity_key: fixture.ids.receiver, state: 'active' }]
}) }));
vi.mock('./workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('./workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group',
    group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' }),
  consumeDesktopWorkgroupNonce: () => true
}));
fixture.routing = new AsyncLocalStorage<ReceiverScope>();
setupSyncPackBuilderTestLifecycle();

it('retains applied article demand through missing body, missing image, and a cold receiver restart over real HTTP', async () => {
  const data = await prepareArticleContinuation(fixture.ids);
  let receiver = data.receiver;
  publishAttachmentLibraryPathSnapshot({ assetsDir: data.sourceAssets, libraryScope: 'source' });
  markDesktopSyncGroupMemberStateReady(fixture.ids.receiver);
  const http = await startAuthenticatedSyncHttp({ sourceDeviceId: fixture.ids.source,
    receiverDeviceId: fixture.ids.receiver });
  const peer = { endpoint_url: http.origin, group_id: 'group', local_device_id: fixture.ids.receiver,
    peer_device_id: fixture.ids.source, peer_device_name: 'Source', peer_platform: 'mac' };
  const drain = () => fixture.routing!.run({ connection: receiver, assetsDir: data.receiverAssets },
    () => drainDesktopSyncGroupResourceArticles(peer));
  const actualFetch = globalThis.fetch.bind(globalThis);
  const requests: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    requests.push(String(input));
    return actualFetch(input, init);
  });
  try {
    const initial = readArticleContinuationState(receiver);
    await expect(drain()).rejects.toThrow('sync_group_resources_incomplete');
    expect(readArticleContinuationState(receiver)).toEqual(initial);
    expect(requests.filter((url) => url.includes('/companion/attachment-resource?'))).toEqual([]);
    openDatabaseConnection().driver.execute('INSERT INTO content_blob_data VALUES (?, ?)', [data.hash, data.body]);
    await expect(drain()).rejects.toThrow('sync_group_resources_incomplete');
    expect(readArticleContinuationState(receiver)).toEqual({ ...initial, bodies: 1 });
    const firstPath = receiverAttachmentPath(data.receiverAssets, data.first.hash);
    const secondPath = receiverAttachmentPath(data.receiverAssets, data.second.hash);
    expect(await hashResourceFile(firstPath)).toBe(data.first.hash);
    await expect(fs.stat(secondPath)).rejects.toMatchObject({ code: 'ENOENT' });
    const beforeRestart = readArticleContinuationState(receiver);
    receiver.sqlite.close();
    receiver = openContinuationReceiver(receiver.dbPath);
    expect(readArticleContinuationState(receiver)).toEqual(beforeRestart);
    await fs.writeFile(data.second.sourcePath, data.secondBytes);
    const resumedRequests = requests.length;
    await expect(drain()).resolves.toBeUndefined();
    expect(readArticleContinuationState(receiver)).toEqual({ ...initial, bodies: 1, pending: 0 });
    expect(await hashResourceFile(secondPath)).toBe(data.second.hash);
    const resumedRanges = requests.slice(resumedRequests).filter((url) => url.includes('/companion/attachment-resource?'));
    expect(resumedRanges).toHaveLength(1);
    expect(new URL(resumedRanges[0]!).searchParams.get('attachment_id')).toBe(data.second.hash);
    const beforeReplay = requests.length;
    await expect(drain()).resolves.toBeUndefined();
    expect(requests.length).toBe(beforeReplay);
    expect(receiver.sqlite.prepare('SELECT data FROM content_blob_data WHERE hash=?').pluck().get(data.hash))
      .toEqual(data.body);
    expect(receiver.sqlite.pragma('quick_check', { simple: true })).toBe('ok');
    await writeArticleContinuationEvidence({ initial, beforeRestart,
      finalState: readArticleContinuationState(receiver), resumedRanges,
      bodyHash: data.hash, imageHashes: [data.first.hash, data.second.hash] });
  } finally {
    vi.restoreAllMocks();
    receiver.sqlite.close();
    await http.close();
    revokeDesktopSyncGroupMemberStateReadiness(fixture.ids.receiver);
  }
}, 60_000);
