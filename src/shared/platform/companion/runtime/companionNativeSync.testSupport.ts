import type { CompanionWorkspaceSyncPlugin } from '../../companionWorkspaceSyncPluginTypes';

export function createCompanionNativeSyncStub(): Pick<CompanionWorkspaceSyncPlugin,
  'loadSyncGroupDeviceIdentity' | 'accessFramedSyncFile' |
  'configureFramedSyncPayloadBudget' | 'closeFramedSyncPayloadBudget'> {
  return {
    loadSyncGroupDeviceIdentity: async ({ database_path }) => ({
      canonical_library_path: database_path,
      device_anchor: 'companion-fixture-anchor',
      device_name: 'Companion fixture',
      path_flavor: 'posix',
      platform: 'android'
    }),
    accessFramedSyncFile: async ({ operation, key }) => {
      if (operation !== 'remove' || key !== 'requests') throw new Error('unexpected_fixture_file_operation');
      return {};
    },
    configureFramedSyncPayloadBudget: async () => {},
    closeFramedSyncPayloadBudget: async () => {}
  };
}
