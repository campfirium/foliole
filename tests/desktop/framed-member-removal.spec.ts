import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('releases a permanently removed receiver delivery through the native command', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const before = await desktopApp.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const path = process.getBuiltinModule('path')!;
    const load = (file: string) => require(path.join(process.cwd(), 'dist', file));
    const connection = load('electron/database/connection.js');
    return connection.runWithDatabaseConnectionOwner(async () => {
      const groups = load('electron/database/syncGroupStore.js');
      const identity = load('lib/platform/syncGroupUnifiedContract.js');
      const groupId = 'framed-native-removal';
      const local = identity.createSyncGroupDeviceIdentity({
        device_anchor: '11111111-1111-4111-8111-111111111111', group_id: groupId,
        library_path: connection.openDatabaseConnection().dbPath, path_flavor: 'posix' });
      const remote = identity.createSyncGroupDeviceIdentity({
        device_anchor: '22222222-2222-4222-8222-222222222222', group_id: groupId,
        library_path: '/isolated-peer/foliole.db', path_flavor: 'posix' });
      groups.createDesktopSyncGroup({ device: local, deviceName: 'Isolated Mac', platform: 'darwin' });
      groups.registerSyncGroupDevice({ device: remote, deviceName: 'Offline peer', platform: 'darwin' });
      const db = load('electron/database/betterSqliteDbPort.js')
        .createBetterSqliteDbPort(connection.openDatabaseConnection().sqlite);
      const canonical = load('lib/core/sync/framedSyncCanonicalManifest.js');
      const manifest = { blobs: [], facts: [{ blobs: [], body: [], factId: 'native-original',
        globalId: 'native-original', kind: 1, objectType: 'node', sharedStateHash: new Uint8Array(32) }] };
      const contentId = await canonical.canonicalContentId(manifest);
      const context = { groupId, protocolVersion: 22, senderDeviceId: local.identity_key,
        senderLibraryEpoch: 'local-epoch', receiverDeviceId: remote.identity_key, receiverLibraryEpoch: 'peer-epoch' };
      const transferId = await canonical.canonicalTransferId(context, contentId);
      await load('lib/core/sync/framedSyncOutboundStaging.js').createFramedSyncOutboundStaging(db)
        .publishOutbound({ contentId, context, manifest, manifestHash: contentId, transferId });
      const held = await db.query('SELECT member_id FROM framed_sync_outbound_holds');
      return { held, peerId: remote.identity_key };
    });
  });
  expect(before.held).toEqual([{ member_id: before.peerId }]);
  await desktopWindow.evaluate((deviceId) => window.electronAPI.invoke(
    'remove_sync_group_device', { device_identity_key: deviceId }), before.peerId);
  const after = await desktopApp.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      return { holds: driver.queryAll('SELECT member_id FROM framed_sync_outbound_holds'),
        publications: driver.queryAll('SELECT state FROM framed_sync_outbound_publications'),
        facts: driver.queryAll('SELECT fact_id FROM framed_sync_outbound_fact_refs'),
        removals: driver.queryAll('SELECT completed_at FROM sync_group_removal_decisions') };
    });
  });
  expect(after.holds).toEqual([]);
  expect(after.publications).toEqual([{ state: 'terminated' }]);
  expect(after.facts).toEqual([{ fact_id: 'native-original' }]);
  expect(after.removals).toEqual([{ completed_at: expect.any(String) }]);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
});
