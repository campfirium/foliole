import { expect, test } from './harness/fixtures';

test('keeps a locally owned watched folder readable after an obsolete member hint', async ({ desktopApp }) => {
  const result = await desktopApp.evaluate(async () => {
    const path = process.getBuiltinModule('path')!;
    const fs = process.getBuiltinModule('fs')!;
    const require = process.getBuiltinModule('module')!.createRequire(path.join(process.cwd(), 'package.json'));
    const load = (name: string) => require(path.join(process.cwd(), `dist/${name}.js`));
    const connection = load('electron/database/connection');
    const groups = load('electron/database/syncGroupStore');
    const identities = load('lib/platform/syncGroupUnifiedContract');
    const sources = load('electron/database/desktopSources');
    const bindings = load('electron/database/watchedFolderBindings');
    const hints = load('electron/database/watchedFolderGroupSources');
    const folder = path.join(process.env.FOLIOLE_LIBRARY_HOME!, 'hint-authority');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'note.md'), 'Owned source remains readable');
    return connection.runWithDatabaseConnectionOwner(() => {
      const local = identities.createSyncGroupDeviceIdentity({ group_id: 'hint-group',
        device_anchor: '11111111-1111-4111-8111-111111111111', library_path: '/local', path_flavor: 'posix' });
      const remote = identities.createSyncGroupDeviceIdentity({ group_id: 'hint-group',
        device_anchor: '22222222-2222-4222-8222-222222222222', library_path: '/remote', path_flavor: 'posix' });
      groups.createDesktopSyncGroup({ device: local, deviceName: 'Local', platform: 'darwin' });
      groups.registerSyncGroupDevice({ device: remote, deviceName: 'Remote', platform: 'darwin' });
      const binding = bindings.upsertChangedWatchedFolderSource({ id: 'hint-rule', primaryPath: folder,
        actionMode: 'keep', archivePath: '', highlightMode: 'merged', highlightPath: '',
        keepPreview: null, keepState: 'enabled' }, '2026-10-19');
      hints.applyRemoteWatchedFolderGroupSources([{
        ...hints.loadWatchedFolderGroupSources(true)[0],
        owner_device_identity_key: remote.identity_key, action_mode: 'delete', updated_at: '2099-01-01'
      }], remote.identity_key);
      const file = sources.resolveDesktopSourceAddress(binding.source_ref, 'note.md');
      return { text: file ? fs.readFileSync(file, 'utf8') : null,
        owner: hints.loadWatchedFolderGroupSources(true)[0]?.owner_device_identity_key,
        localId: local.identity_key };
    });
  });
  expect(result.text).toBe('Owned source remains readable');
  expect(result.owner).toBe(result.localId);
});
