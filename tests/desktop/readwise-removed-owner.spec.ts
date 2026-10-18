import { expect, test } from './harness/fixtures';

test('activates Readwise after the old owner is explicitly removed', async ({ desktopApp }) => {
  const result = await desktopApp.evaluate(async () => {
    const pathApi = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const load = (name: string) => require(pathApi.join(process.cwd(), `dist/${name}.js`));
    const connection = load('electron/database/connection');
    const groups = load('electron/database/syncGroupStore');
    const settings = load('electron/database/settingsStore');
    const handoff = load('electron/sync/readwiseOwnerHandoff');
    const groupId = 'native-owner-removal';
    const old = load('lib/platform/syncGroupUnifiedContract').createSyncGroupDeviceIdentity({
      group_id: groupId, device_anchor: '11111111-1111-4111-8111-111111111111',
      library_path: '/old', path_flavor: 'posix'
    });
    const local = await connection.runWithDatabaseConnectionOwner(async () => {
      const { identity } = await load('electron/deviceAnchorStore').loadDesktopDeviceIdentity({
        groupId, libraryPath: connection.openDatabaseConnection().dbPath
      });
      groups.createDesktopSyncGroup({ device: identity, deviceName: 'Candidate', platform: 'darwin' });
      groups.registerSyncGroupDevice({ device: old, deviceName: 'Old', platform: 'darwin' });
      settings.saveJsonSetting('readwise_source_mode', { mode: 'relay', version: 1 });
      settings.saveJsonSetting('readwise_active_host', { device_identity_key: old.identity_key, host_name: 'Old', epoch: 4 });
      return identity;
    });
    const offline = await handoff.activateReadwiseWithHandoff();
    await connection.runWithDatabaseConnectionOwner(() =>
      load('electron/database/syncGroupMemberStateStore').initiateDesktopSyncGroupDeviceRemoval(old.identity_key));
    const removed = await handoff.activateReadwiseWithHandoff();
    const guard = await connection.runWithDatabaseConnectionOwner(() =>
      load('electron/database/readwiseOwnerGuard').loadReadwiseOwnerGuard(groupId));
    return { offline, removed, guard, localId: local.identity_key };
  });
  expect(result.offline).toMatchObject({ is_active: false, active_owner_epoch: 4 });
  expect(result.removed).toMatchObject({ is_active: true, active_owner_epoch: 5,
    active_device_identity_key: result.localId });
  expect(result.guard).toMatchObject({ state: 'active', epoch: 5, ownerId: result.localId });
  await test.info().attach('removed-owner-takeover', {
    body: JSON.stringify(result, null, 2), contentType: 'application/json'
  });
});
