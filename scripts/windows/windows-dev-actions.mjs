import {
  WINDOWS_SYNC_GROUP_PROVIDER_RELEASE_ACTIONS
} from './windows-sync-group-provider-release-control.mjs';

export const WINDOWS_DEV_ACTIONS = [
  'appearance', 'build', 'capture-annotation', 'deploy', 'desktop-preview', 'device-profile',
  'internal-install', 'internal-open', 'live', 'secondary', 'default-sync-journey',
  'frozen-revision-preflight', 'readwise-api-connection', 'readwise-api-external', 'readwise-api-import',
  'readwise-api-scheduler',
  'desktop-dnssd-host-facts', 'desktop-dnssd-advertise-acceptance',
  'desktop-dnssd-find-acceptance', 'desktop-dnssd-find-diagnostic',
  'desktop-dnssd-route-prepare', 'desktop-dnssd-route-provider',
  'desktop-dnssd-route-selfcheck', 'sync-group-join-prepare',
  'multi-device-sync-a-leave', 'multi-device-sync-a-rejoin', 'multi-device-sync-c',
  'multi-device-sync-candidate', 'multi-device-sync-from-zero', 'multi-device-sync-participation',
  'single-principal-sync-group', 'two-device-sync-provider',
  ...Object.values(WINDOWS_SYNC_GROUP_PROVIDER_RELEASE_ACTIONS),
  'verify'
];
