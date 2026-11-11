import { expect } from 'vitest';

import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { webDavAuthenticationKey } from '../../lib/core/sync/webDavAuthenticationPause.js';
import { runWebDavRelayBodyRound } from '../../lib/core/sync/webDavRelayBodyRound.js';
import { readWebDavRelayBodyScope } from '../../lib/core/sync/webDavRelayBodyScope.js';
import { webDavRelayStatus, type WebDavRelayRequest } from '../../lib/core/sync/webDavRelayPublication.js';
import { restoreFixture, type RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { createDesktopWebDavRelayHttp, type DesktopWebDavRelayHttpStats } from './desktopWebDavRelayHttp.js';
import { runWebDavTestLanRound, webDavTestGroupKey } from './webDavRelayLan.testSupport.js';
import { setupDav } from './webDavRelayTransport.testSupport.js';

type RelayAuthentication = { revision: number; manual?: boolean };
type RelayFixture = {
  source: RestorePeer;
  target: RestorePeer;
  dav: ReturnType<typeof setupDav>;
  scope(peer: RestorePeer): Promise<NonNullable<Awaited<ReturnType<typeof readWebDavRelayBodyScope>>>>;
  sync(peer: RestorePeer, http?: DesktopWebDavRelayHttpStats, lanConnected?: boolean, foregroundReceive?: boolean,
    auth?: RelayAuthentication): ReturnType<typeof runWebDavRelayBodyRound>;
};

export async function withRelayPeers(run: (fixture: RelayFixture) => Promise<void>,
  intercept?: Parameters<typeof setupDav>[1]) {
  const fixture = await restoreFixture();
  const upstream = process.env.FOLIOLE_TEST_WEBDAV_URL;
  const dav = setupDav(upstream, intercept);
  await new Promise<void>(resolve => dav.server.listen(0, '127.0.0.1', resolve));
  try {
    const source = fixture.peer('source');
    const target = await fixture.companionPeer('target');
    const address = dav.server.address();
    if (!address || typeof address === 'string') throw new Error('webdav_fixture_address_missing');
    const directory = new URL(`http://127.0.0.1:${address.port}${dav.sandboxPath}${crypto.randomUUID()}/`);
    await createDesktopWebDavRelayHttp(stats())(directory, { method: 'MKCOL' }, webDavRelayStatus);
    const binding = { id: crypto.randomUUID(), group_id: 'group', desktop_device_id: source.id,
      phone_device_id: target.id, directory_url: directory.href };
    await establishBaseline(source, target, binding);

    const scope = async (peer: RestorePeer) => {
      const result = await readWebDavRelayBodyScope(peer.db, binding, peer.id);
      if (!result) throw new Error('test_baseline_missing');
      return result;
    };
    const sync: RelayFixture['sync'] = async (peer, http = stats(), lanConnected = false, foregroundReceive = false, auth) => {
      const transport = createDesktopWebDavRelayHttp(http);
      const request: WebDavRelayRequest = auth ? (url, input, receive) => transport(url, {
        ...input, headers: { ...input.headers, 'x-test-dav-device': peer.id }
      }, receive) : transport;
      const authKey = auth && webDavAuthenticationKey(binding, peer.id, peer.epoch, auth.revision);
      return runWebDavRelayBodyRound({
        host: { ...peer.host, enqueueSearchInvalidations: peer.desktop }, files: peer.host.files,
        request, scope: await scope(peer), groupKey: webDavTestGroupKey,
        ...(authKey ? { authentication: { key: authKey, manual: Boolean(auth?.manual) } } : {}),
        foregroundReceive, lanConnected: () => lanConnected, assertScope: async () => { await scope(peer); },
        progress: { published: 0, applied: 0, retries: 0 }
      });
    };

    await run({ source, target, scope, sync, dav });
  } finally {
    await new Promise<void>(resolve => dav.server.close(() => resolve()));
    await fixture.close();
  }
}

async function establishBaseline(source: RestorePeer, target: RestorePeer,
  binding: Parameters<typeof readWebDavRelayBodyScope>[1]) {
  const shared = textBranch('shared-head', 'Shared review material');
  await applySyncNodesWithDbPort(source.db, [{ ...shared, object_id: 'shared',
    snapshot: { ...shared.snapshot, id: 'shared', kind: 'item' } }]);
  expect(await runWebDavTestLanRound(source, target, binding)).toMatchObject({ complete: true });
  for (const [local, remote] of [[source, target], [target, source]] as const) {
    await local.db.run('INSERT OR IGNORE INTO node_version_device_revisions VALUES (?, ?, ?, 0, ?, NULL, ?)',
      ['group', remote.id, remote.epoch, 'baseline', new Date().toISOString()]);
  }
}

export function stats(): DesktopWebDavRelayHttpStats {
  return { requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0 };
}

export async function edit(peer: RestorePeer, id: string, body: string) {
  const branch = textBranch(`${id}-version`, body);
  await applySyncNodesWithDbPort(peer.db, [{ ...branch, object_id: id, snapshot: { ...branch.snapshot, id } }],
    { enqueueSearchInvalidations: peer.desktop, operation: 'local_mutation' });
}

export async function text(peer: RestorePeer, id: string) {
  return (await peer.db.query<{ content: string }>('SELECT content FROM nodes WHERE id = ?', [id]))[0]?.content;
}
