export const SYNC_GROUP_JOIN_PREPARE_INVENTORY_VERSION = 1;

export const SYNC_GROUP_JOIN_PREPARE_HOSTS = [
  {
    activation: 'inactive',
    bridge: 'electron/preloadSyncGroupJoinPrepare.cjs',
    host: 'electron-macos-windows',
    provider: 'electron/sync/syncGroupJoinPrepareProvider.ts',
    status: 'prepared'
  },
  {
    activation: 'inactive',
    bridge: 'android/app/src/main/java/com/foliole/android/FolioleCompanionJoinRequestPlugin.java',
    host: 'android',
    provider: 'android/app/src/main/java/com/foliole/android/FolioleCompanionJoinRequestProvider.java',
    status: 'prepared'
  },
  {
    activation: 'inactive',
    bridge: 'ios/App/App/FolioleCompanionSyncGroupJoinPreparePlugin.swift',
    host: 'ios',
    projection: 'src/shared/platform/companion/sync/syncGroupJoinPrepare.ts',
    provider: 'ios/App/App/FolioleCompanionSyncGroupJoinProvider.swift',
    status: 'prepared'
  }
] as const;

export const SYNC_GROUP_JOIN_REUSED_CRYPTO_HELPERS = [
  'electron/sync/companionPairingEncryption.ts',
  'src/shared/platform/companionPairingEncryption.ts',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupPairCrypto.java',
  'ios/App/App/FolioleCompanionSyncGroupJoinCrypto.swift'
] as const;

export const SYNC_GROUP_JOIN_LEGACY_CONSUMERS = [
  'electron/ipc/companionPairingCommands.ts',
  'electron/sync/companionLanPairCompletion.ts',
  'electron/sync/companionLanPairingEndpoints.ts',
  'electron/sync/companionMembershipApproval.ts',
  'electron/sync/companionPairingRequests.ts',
  'electron/sync/companionPairingStore.ts',
  'src/app/components/CompanionPairingRequestsDialog.tsx',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupJoinGrantStore.java',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupProvider.java',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupServer.java',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncPlugin.java',
  'src/companion/CompanionSyncGroupJoinApproval.tsx',
  'ios/App/App/FolioleCompanionPairingStore.swift',
  'ios/App/App/FolioleCompanionSyncPlugin.swift'
] as const;

export function syncGroupJoinPrepareMissingHosts() {
  return SYNC_GROUP_JOIN_PREPARE_HOSTS
    .filter((host) => host.status !== 'prepared')
    .map((host) => host.host);
}
