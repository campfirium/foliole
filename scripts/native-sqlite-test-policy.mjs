const controlledElectronSqliteTests = [
  'electron/database/betterSqliteDbPort.conformance.test.ts',
  'electron/database/companionSyncPushVerticalSlice.test.ts',
  'electron/database/externalDocumentImportVisibility.test.ts',
  'electron/database/externalSearchCache.test.ts',
  'electron/database/externalSearchMirrorAvailability.test.ts',
  'electron/database/externalSearchSidecar.test.ts',
  'electron/database/libraryDataMigration.test.ts',
  'electron/database/mainFtsCleanup.test.ts',
  'electron/database/migrate.internalSnapshots.test.ts',
  'electron/database/syncPackBuilder.contract.test.ts',
  'electron/database/syncPackNodeAttachments.test.ts',
  'electron/database/workspaceSearchSidecar.test.ts',
  'electron/sync/syncPackNodeApplyParentOrder.test.ts',
  'electron/sync/syncPackLearningDependencyApply.test.ts',
  'electron/sync/syncPackNodeApplyExecutor.test.ts',
  'scripts/android/android-reset-sync-data.test.mjs',
  'scripts/android/android-sync-audit-core.test.mjs',
  'scripts/android/android-sync-cleanup-device-private.test.mjs',
  'scripts/sqlite-recovery-drill.test.mjs',
  'scripts/sqlite-maintenance-cleanup-main-fts.test.mjs',
  'scripts/sqlite-maintenance.test.mjs',
  'src/shared/platform/companionSyncNodeVersions.sequentialReading.test.ts',
  'src/shared/platform/companionSyncNodeVersions.test.ts',
  'src/shared/platform/companionSyncReviewLogApply.test.ts',
  'src/shared/platform/companionSyncStateObjects.test.ts'
];

const ordinaryNodeSqliteTextOnlyTests = [];

export {
  controlledElectronSqliteTests,
  ordinaryNodeSqliteTextOnlyTests
};
