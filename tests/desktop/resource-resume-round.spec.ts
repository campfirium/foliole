import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

function assertResult(result: {
  status: number; roundId: string; index: Record<string, unknown>; packStatus: string;
}) {
  expect(result.status).toBe(200);
  expect(result.index.round_source_view_id).toBe(result.roundId);
  expect(result.packStatus).toBe('ready');
  expect(result.index.from_state_seq).toBe(result.index.to_state_seq);
}

test('accepts an empty repeat sync while an unconfirmed source round remains', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const result = await desktopApp.evaluate(async () => {
    const path = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const load = (file: string) => require(path.join(process.cwd(), 'dist', file));
    const connection = load('electron/database/connection.js');
    const store = load('electron/database/syncGroupStore.js');
    const identity = load('lib/platform/syncGroupUnifiedContract.js');
    const sessions = load('electron/sync/companionLanFactSession.js');
    const facts = load('electron/sync/companionLanSyncPackFacts.js');
    const packs = load('electron/sync/companionLanSyncPack.js');
    return connection.runWithDatabaseConnectionOwner(async () => {
      const device = identity.createSyncGroupDeviceIdentity({ device_anchor:
        '11111111-1111-4111-8111-111111111111', group_id: 'resource-resume',
      library_path: connection.openDatabaseConnection().dbPath, path_flavor: 'posix' });
      const group = store.loadDesktopSyncGroup() ?? store.createDesktopSyncGroup({
        device, deviceName: 'Source', platform: 'mac' });
      const peer = identity.createSyncGroupDeviceIdentity({ device_anchor:
        '22222222-2222-4222-8222-222222222222', group_id: group.group_id,
      library_path: '/isolated/receiver', path_flavor: 'posix' });
      store.registerSyncGroupDevice({ device: peer, deviceName: 'Receiver', platform: 'mac' });
      facts.loadCompanionSyncPackFactIndex(new URL('http://localhost/companion/sync-pack-facts?' +
        'page_contract=bounded-v1&after_state_seq=0'), peer.identity_key);
      const state = connection.openDatabaseConnection().driver.queryOne(
        'SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1');
      const session = await sessions.createCompanionFactSession({ groupId: group.group_id,
        toPeerId: peer.identity_key, window: { fromStateSeq: state.high_water,
          toStateSeq: state.high_water, frontierStateSeq: state.high_water, sourceEpoch: state.source_epoch } });
      const roundId = session.roundSourceViewId;
      session.view.close();
      const request = new URL(`http://localhost/companion/sync-pack-facts?` +
        `page_contract=bounded-v1&after_state_seq=${state.high_water}`);
      let index: Record<string, unknown> = {};
      let status = 0;
      await facts.handleCompanionSyncPackFactsGet({}, {}, request, peer.identity_key,
        (_request: unknown, _response: unknown, code: number, payload: Record<string, unknown>) => {
          status = code; index = payload;
        });
      request.pathname = '/companion/sync-pack';
      for (const key of ['frontier_state_seq', 'source_epoch', 'fact_index_id',
        'round_source_view_id', 'to_state_seq']) {
        const value = key === 'fact_index_id' ? index.index_id : index[key];
        if (value !== undefined) request.searchParams.set(key, String(value));
      }
      for (const key of ['have_v', 'have_p', 'have_r']) request.searchParams.set(key, '');
      const pack = await packs.buildCompanionSyncPackResource(request, peer.identity_key);
      try { return { status, roundId, index, packStatus: pack.status }; }
      finally { await pack.cleanup?.(); }
    });
  });
  assertResult(result);
  await testInfo.attach('resource-resume-round', {
    body: JSON.stringify(result, null, 2), contentType: 'application/json'
  });
});
