import { WINDOWS_SYNC_GROUP_ACTIONS } from './windows-sync-group-build-routing.mjs';

export const WINDOWS_DEV_BUILD_ACTIONS = [
  'appearance', 'build', 'capture-annotation', 'deploy', 'device-profile',
  'frozen-revision-preflight', 'live', 'secondary', 'sync-group-join-prepare',
  ...WINDOWS_SYNC_GROUP_ACTIONS, 'verify'
];
