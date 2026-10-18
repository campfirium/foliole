import { expect, test } from './harness/fixtures';

test('releases an abandoned Readwise stop without changing its persisted owner', async ({ desktopApp }) => {
  test.setTimeout(90_000);
  const result = await desktopApp.evaluate(async () => {
    const pathApi = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const load = (name: string) => require(pathApi.join(process.cwd(), `dist/${name}.js`));
    const connection = load('electron/database/connection');
    const settings = load('electron/database/settingsStore');
    const groups = load('electron/database/syncGroupStore');
    const guards = load('electron/database/readwiseOwnerGuard');
    const assignment = load('electron/database/readwiseHostAssignment');
    const stops = load('electron/sync/readwiseOwnerStop');
    const runs = load('electron/import/keepImportRunnerOwner');
    const identity = load('lib/platform/syncGroupUnifiedContract');
    const local = identity.createSyncGroupDeviceIdentity({ group_id: 'stop-expiry',
      device_anchor: '11111111-1111-4111-8111-111111111111', library_path: '/old', path_flavor: 'posix' });
    const target = identity.createSyncGroupDeviceIdentity({ group_id: 'stop-expiry',
      device_anchor: '22222222-2222-4222-8222-222222222222', library_path: '/new', path_flavor: 'posix' });
    await connection.runWithDatabaseConnectionOwner(() => {
      load('electron/import/readwiseApiScheduler').stopReadwiseApiScheduler();
      groups.createDesktopSyncGroup({ device: local, deviceName: 'Old', platform: 'darwin' });
      groups.registerSyncGroupDevice({ device: target, deviceName: 'New', platform: 'win32' });
      settings.saveJsonSetting('readwise_source_mode', { mode: 'relay', version: 1 });
      settings.saveJsonSetting('readwise_active_host', { device_identity_key: local.identity_key,
        host_name: 'Old', epoch: 2 });
      guards.saveReadwiseOwnerGuard({ epoch: 2, groupId: 'stop-expiry', mode: 'relay',
        ownerId: local.identity_key, state: 'active', targetId: null });
    });
    let release = () => {};
    const work = new Promise<void>(resolve => { release = resolve; });
    const running = runs.requestKeepImportRun({ ruleId: 'native-held-import', sourceType: 'readwise',
      directoryPath: '/unused', highlightPolicy: 'adopt' }, () => work);
    try {
      const pending = await connection.runWithDatabaseConnectionOwner(() => ({
        response: stops.handleReadwiseOwnerStop(JSON.stringify({ epoch: 2, groupId: 'stop-expiry',
          mode: 'relay', ownerId: local.identity_key, requestId: 'native-attempt',
          targetId: target.identity_key }), target.identity_key),
        active: assignment.loadReadwiseHostAssignment().is_active
      }));
      release();
      await running;
      await new Promise(resolve => setTimeout(resolve, 31_000));
      const recovered = await connection.runWithDatabaseConnectionOwner(() => ({
        active: assignment.loadReadwiseHostAssignment().is_active,
        guard: guards.loadReadwiseOwnerGuard('stop-expiry')
      }));
      return { pending, recovered };
    } finally {
      release();
      await running;
      stops.resumeReadwiseExecutionAfterActivation();
    }
  });
  expect(result.pending).toMatchObject({ response: { status: 'pending' }, active: false });
  expect(result.recovered).toMatchObject({ active: true, guard: { state: 'active', epoch: 2, targetId: null } });
  await test.info().attach('owner-stop-expiry', {
    body: JSON.stringify(result, null, 2), contentType: 'application/json'
  });
});
