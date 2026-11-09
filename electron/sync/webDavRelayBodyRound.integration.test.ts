// @vitest-environment node
import { expect, it } from 'vitest';

import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { readWebDavRelayBodyOutbox } from '../../lib/core/sync/webDavRelayBodyOutbox.js';
import { runWebDavRelayBodyRound } from '../../lib/core/sync/webDavRelayBodyRound.js';
import { readWebDavRelayBodyScope } from '../../lib/core/sync/webDavRelayBodyScope.js';
import { webDavRelayStatus } from '../../lib/core/sync/webDavRelayPublication.js';
import { restoreFixture, type RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { createDesktopWebDavRelayHttp, type DesktopWebDavRelayHttpStats } from './desktopWebDavRelayHttp.js';
import { runWebDavTestLanRound, webDavTestGroupKey } from './webDavRelayLan.testSupport.js';
import { setupDav } from './webDavRelayTransport.testSupport.js';

it('recovers the same publication after reopening, exchanges bodies both ways and resumes LAN', async () => {
  const fixture = await restoreFixture();
  const upstream = process.env.FOLIOLE_TEST_WEBDAV_URL;
  const dav = setupDav(upstream);
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
    let lanConnected = false;
    const sync = async (peer: RestorePeer, http = stats()) => runWebDavRelayBodyRound({
      host: { ...peer.host, enqueueSearchInvalidations: peer.desktop }, files: peer.host.files,
      request: createDesktopWebDavRelayHttp(http), scope: await scope(peer), groupKey: webDavTestGroupKey,
      lanConnected: () => lanConnected, assertScope: async () => { await scope(peer); },
      progress: { published: 0, applied: 0, retries: 0 }
    });

    await edit(source, 'mac', 'first Mac body');
    lanConnected = true;
    const directStats = stats();
    expect(await sync(source, directStats)).toMatchObject({ published: 0 });
    expect(directStats.requests).not.toHaveProperty('PUT');
    lanConnected = false;

    dav.dropNextMove();
    await expect(sync(source)).rejects.toThrow();
    const pending = await readWebDavRelayBodyOutbox(source.db, await scope(source));
    expect(pending.packet).not.toBeNull();
    await edit(source, 'mac-later', 'later Mac body');
    source.reopen();
    expect(await readWebDavRelayBodyOutbox(source.db, await scope(source))).toEqual(pending);
    const retried = stats();
    expect(await sync(source, retried)).toMatchObject({ retries: 1, published: 2 });
    expect(retried.requests.PUT).toBe(1);

    await edit(target, 'phone', 'first phone body');
    expect(await sync(target)).toMatchObject({ applied: 2 });
    target.reopen();
    expect(await text(target, 'mac')).toBe('first Mac body');
    expect(await text(target, 'mac-later')).toBe('later Mac body');
    expect(await sync(target)).toMatchObject({ applied: 0 });
    expect(await sync(source)).toMatchObject({ applied: expect.any(Number) });
    source.reopen();
    expect(await text(source, 'phone')).toBe('first phone body');
    expect(await runWebDavTestLanRound(source, target)).toMatchObject({ complete: true, transferred: 0 });
  } finally {
    await new Promise<void>(resolve => dav.server.close(() => resolve()));
    await fixture.close();
  }
});

async function establishBaseline(source: RestorePeer, target: RestorePeer,
  binding: Parameters<typeof readWebDavRelayBodyScope>[1]) {
  await source.seed('shared');
  expect(await runWebDavTestLanRound(source, target, binding)).toMatchObject({ complete: true });
  for (const [local, remote] of [[source, target], [target, source]] as const) {
    await local.db.run('INSERT OR IGNORE INTO node_version_device_revisions VALUES (?, ?, ?, 0, ?, NULL, ?)',
      ['group', remote.id, remote.epoch, 'baseline', new Date().toISOString()]);
  }
}

function stats(): DesktopWebDavRelayHttpStats {
  return { requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0 };
}

async function edit(peer: RestorePeer, id: string, body: string) {
  const branch = textBranch(`${id}-version`, body);
  await applySyncNodesWithDbPort(peer.db, [{ ...branch, object_id: id, snapshot: { ...branch.snapshot, id } }],
    { enqueueSearchInvalidations: peer.desktop, operation: 'local_mutation' });
}

async function text(peer: RestorePeer, id: string) {
  return (await peer.db.query<{ content: string }>('SELECT content FROM nodes WHERE id = ?', [id]))[0]?.content;
}
