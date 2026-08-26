export const SYNC_GROUP_JOIN_INVENTORY_VERSION = 2;

export const SYNC_GROUP_JOIN_ACTIVE_HOSTS = [
  {
    bridge: 'electron/preload.cjs',
    host: 'electron-macos-windows',
    provider: 'electron/sync/syncGroupJoinProvider.ts'
  },
  {
    bridge: 'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncPlugin.java',
    host: 'android',
    provider: 'android/app/src/main/java/com/foliole/android/FolioleCompanionJoinRequestProvider.java'
  },
  {
    bridge: 'ios/App/App/FolioleCompanionSyncPlugin.swift',
    host: 'ios',
    provider: 'ios/App/App/FolioleCompanionSyncGroupJoinProvider.swift'
  }
] as const;

export const SYNC_GROUP_JOIN_CRYPTO_HELPERS = [
  'electron/sync/desktopSyncGroupJoinCrypto.ts',
  'src/shared/platform/companionSyncGroupJoinEncryption.ts',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupJoinCrypto.java',
  'ios/App/App/FolioleCompanionSyncGroupJoinCrypto.swift'
] as const;

export const SYNC_GROUP_JOIN_RETIRED_CONSUMERS = [
  'electron/preloadSyncGroupJoinPrepare.cjs',
  'electron/ipc/companionPairingCommands.ts',
  'electron/sync/companionLanPairCompletion.ts',
  'electron/sync/companionLanPairingEndpoints.ts',
  'electron/sync/companionMembershipApproval.ts',
  'electron/sync/companionPairingRequests.ts',
  'electron/sync/companionPairingStore.ts',
  'electron/sync/syncGroupJoinPrepareProvider.ts',
  'src/app/components/CompanionPairingRequestsDialog.tsx',
  'src/shared/platform/companion/sync/syncGroupJoinPrepare.ts',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupJoinGrantStore.java',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionPairingStore.java',
  'ios/App/App/FolioleCompanionPairingStore.swift',
  'ios/App/App/FolioleCompanionSyncGroupJoinPreparePlugin.swift'
] as const;

export function syncGroupJoinMissingActiveHosts() {
  return SYNC_GROUP_JOIN_ACTIVE_HOSTS.filter((host) => !host.provider || !host.bridge).map((host) => host.host);
}
