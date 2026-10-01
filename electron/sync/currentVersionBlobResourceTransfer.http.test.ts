// @vitest-environment node
import { AsyncLocalStorage } from 'node:async_hooks';
import { promises as fs } from 'node:fs';

import { expect, it, vi } from 'vitest';

import { publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { openDatabaseConnection, type DatabaseConnection } from '../database/connection.js';
import { mockedSyncPackBuilderAppDataDir, setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { prepareArticleContinuation, readArticleContinuationState } from './desktopResourceArticleContinuation.testSupport.js';
import { markDesktopSyncGroupMemberStateReady,
  revokeDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import { drainDesktopSyncGroupResourceArticles } from './desktopSyncGroupResourceArticleDrain.js';

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

// The retained current body must satisfy its manifest without another blob download.
it.each(['retained', 'reclaimed', 'mismatch'])('uses local bytes only when the retained current body matches: %s', async (mode) => {
  const data = await prepareArticleContinuation(fixture.ids);
  const receiver = data.receiver;
  if (mode === 'reclaimed') receiver.sqlite.exec(`UPDATE node_sync_versions SET body_text = NULL,
    snapshot_json = json_set(snapshot_json, '$.content', NULL)`);
  if (mode === 'mismatch') receiver.sqlite.prepare(`UPDATE node_sync_versions SET body_text = ?,
    snapshot_json = json_set(snapshot_json, '$.content', ?)`)
    .run('x' + data.body.toString('utf8').slice(1), 'x' + data.body.toString('utf8').slice(1));
  openDatabaseConnection().driver.execute('INSERT INTO content_blob_data VALUES (?, ?)', [data.hash, data.body]);
  await fs.writeFile(data.second.sourcePath, data.secondBytes);
  publishAttachmentLibraryPathSnapshot({ assetsDir: data.sourceAssets, libraryScope: 'source' });
  markDesktopSyncGroupMemberStateReady(fixture.ids.receiver);
  const http = await startAuthenticatedSyncHttp({ sourceDeviceId: fixture.ids.source,
    receiverDeviceId: fixture.ids.receiver });
  const peer = { endpoint_url: http.origin, group_id: 'group', local_device_id: fixture.ids.receiver,
    peer_device_id: fixture.ids.source, peer_device_name: 'Source', peer_platform: 'mac' };
  const actualFetch = globalThis.fetch.bind(globalThis);
  const requests: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    requests.push(String(input));
    return actualFetch(input, init);
  });
  try {
    const initial = readArticleContinuationState(receiver);
    expect(initial.bodies).toBe(0);
    expect(receiver.sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id=?')
      .pluck().get('article-head')).toBe(mode === 'reclaimed' ? null
        : mode === 'mismatch' ? 'x' + data.body.toString('utf8').slice(1) : data.body.toString('utf8'));
    await fixture.routing!.run({ connection: receiver, assetsDir: data.receiverAssets },
      () => drainDesktopSyncGroupResourceArticles(peer));
    const bodyRequests = requests.filter((url) => new URL(url).pathname === '/companion/content-blobs');
    expect(bodyRequests).toHaveLength(mode === 'retained' ? 0 : 1);
    expect(receiver.sqlite.prepare('SELECT data FROM content_blob_data WHERE hash=?').pluck().get(data.hash))
      .toEqual(data.body);
    expect(readArticleContinuationState(receiver)).toEqual({ ...initial, bodies: 1, pending: 0 });
    await fs.mkdir('.tmp/artifacts/T277', { recursive: true });
    await fs.writeFile(`.tmp/artifacts/T277/current-body-materialized-transfer-${mode}.json`, JSON.stringify({
      diagnostic: false, scope: 'production resource drain with retained version fixture; not full inbound pack',
      initial, final: readArticleContinuationState(receiver), currentBlobHash: data.hash,
      retainedVersionBodyBytes: data.body.length, blobRequests: bodyRequests.length,
      blobPayloadBytes: bodyRequests.length * data.body.length, requests
    }, null, 2));
  } finally {
    vi.restoreAllMocks();
    receiver.sqlite.close();
    await http.close();
    revokeDesktopSyncGroupMemberStateReadiness(fixture.ids.receiver);
  }
}, 60_000);
