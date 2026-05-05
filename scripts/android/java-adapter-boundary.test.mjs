// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const JAVA_ROOT = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android');

const CLASSIFICATIONS = {
  asset_support: [
    'FolioleCompanionAssetReader.java',
    'FolioleCompanionJsonValueParser.java',
    'FolioleCompanionSyncContentHash.java'
  ],
  bridge_contract_metadata: [
    'FolioleCompanionBridgeContractDefinitions.java',
    'FolioleCompanionHostBridgeContractDefinitions.java'
  ],
  bridge_plugin_adapter: [
    'FolioleCompanionAppDataPlugin.java',
    'FolioleCompanionBootstrapPlugin.java',
    'FolioleCompanionDatabasePlugin.java',
    'FolioleCompanionPairingPluginActions.java',
    'FolioleCompanionResourcePluginActions.java',
    'FolioleCompanionSyncDataPluginActions.java',
    'FolioleCompanionSyncPackTransferPlugin.java',
    'FolioleCompanionSyncPlugin.java',
    'FolioleCompanionSyncStatePluginActions.java',
    'FolioleCompanionWorkspaceSyncPluginActions.java'
  ],
  generated_definition_reader: [
    'FolioleCompanionContentReadQueryRules.java',
    'FolioleCompanionDocumentPayloadRules.java',
    'FolioleCompanionHostSupportMutationRules.java',
    'FolioleCompanionLearningPayloadRules.java',
    'FolioleCompanionMigrationRules.java',
    'FolioleCompanionMissingResourceQueryRules.java',
    'FolioleCompanionMutationAssetKeys.java',
    'FolioleCompanionNodeAttachmentQueryRules.java',
    'FolioleCompanionQueryAssetKeys.java',
    'FolioleCompanionQueryDefinitionShapeKeys.java',
    'FolioleCompanionResourceMutationRules.java',
    'FolioleCompanionResourceReadQueryRules.java',
    'FolioleCompanionRuntimeMutationRules.java',
    'FolioleCompanionRuntimeQueryRules.java',
    'FolioleCompanionSyncApplyMutationRules.java',
    'FolioleCompanionSyncConflictQueryRules.java',
    'FolioleCompanionSyncDiagnosticQueryRules.java',
    'FolioleCompanionSyncObjectQueryRules.java',
    'FolioleCompanionSyncPayloadRoutingRules.java',
    'FolioleCompanionSyncProtocolDefinitions.java',
    'FolioleCompanionSyncPushAckRules.java',
    'FolioleCompanionSyncReviewLogRecordRules.java',
    'FolioleCompanionSyncSettingPayloadRules.java',
    'FolioleCompanionSyncStreamQueryRules.java',
    'FolioleCompanionSyncWriteRules.java',
    'FolioleCompanionViewStatePayloadRules.java',
    'FolioleCompanionWorkspaceReadQueryRules.java'
  ],
  host_platform_adapter: [
    'FolioleCompanionAppDataStore.java',
    'FolioleCompanionBootstrapState.java',
    'FolioleCompanionContentBlobBatchText.java',
    'FolioleCompanionContentBlobMultipartBatch.java',
    'FolioleCompanionDatabaseBackup.java',
    'FolioleCompanionDatabaseHelper.java',
    'FolioleCompanionDesktopHttpClient.java',
    'FolioleCompanionNetworkPluginActions.java',
    'FolioleCompanionNsdDiscovery.java',
    'FolioleCompanionPairingStore.java',
    'FolioleCompanionSyncPackTransfer.java',
    'FolioleCompanionWebView.java',
    'MainActivity.java'
  ],
  migration_adapter: [
    'FolioleCompanionDatabaseMigration.java',
    'FolioleCompanionSchemaInstaller.java',
    'FolioleCompanionSqliteRuntime.java'
  ],
  query_mutation_executor: [
    'FolioleCompanionGeneratedMutationRunner.java',
    'FolioleCompanionGeneratedQueryRunner.java',
    'FolioleCompanionNamedMutationStore.java',
    'FolioleCompanionNamedQueryStore.java'
  ],
  sync_diagnostic_adapter: [
    'FolioleCompanionSyncDiagnosticContent.java',
    'FolioleCompanionSyncDiagnosticMeta.java',
    'FolioleCompanionSyncDiagnosticState.java',
    'FolioleCompanionSyncDiagnosticStorage.java',
    'FolioleCompanionSyncDiagnosticVerdicts.java',
    'FolioleCompanionSyncDiagnostics.java'
  ],
  store_executor: [
    'FolioleCompanionAttachmentResourceBatchStore.java',
    'FolioleCompanionAttachmentResourceMissingStore.java',
    'FolioleCompanionAttachmentResourceStore.java',
    'FolioleCompanionContentBlobBatchManifestStore.java',
    'FolioleCompanionContentBlobBatchStore.java',
    'FolioleCompanionContentBlobMissingStore.java',
    'FolioleCompanionContentBlobStore.java',
    'FolioleCompanionDocumentSyncPayload.java',
    'FolioleCompanionExternalDocumentStore.java',
    'FolioleCompanionLearningSyncPayload.java',
    'FolioleCompanionMetaRecords.java',
    'FolioleCompanionNodeAttachmentStore.java',
    'FolioleCompanionPdfPageTextStore.java',
    'FolioleCompanionReadableArticleQuery.java',
    'FolioleCompanionSyncMetaStore.java',
    'FolioleCompanionSyncNodeVersionStore.java',
    'FolioleCompanionSyncObjectStore.java',
    'FolioleCompanionSyncPayloadJson.java',
    'FolioleCompanionSyncPayloadQueryStore.java',
    'FolioleCompanionSyncPushAckStore.java',
    'FolioleCompanionSyncReviewLogStore.java',
    'FolioleCompanionSyncStateWriteStore.java',
    'FolioleCompanionTextBodyBlobs.java',
    'FolioleCompanionViewStateSyncStore.java',
    'FolioleCompanionWorkspaceNodeSnapshotBuilder.java',
    'FolioleCompanionWorkspaceSnapshotExporter.java',
    'FolioleCompanionWorkspaceViewStateExporter.java'
  ]
};

const REMOVED_BUSINESS_FORKS = [
  'FolioleCompanionSyncConflictStore.java',
  'FolioleCompanionSyncObjectApply.java',
  'FolioleCompanionSyncStateRows.java'
];

const FORBIDDEN_BUSINESS_RULE_PATTERNS = [
  /\bchooseConflictWinner\b/,
  /\bresolveConflict\b/,
  /\bmergeConflict\b/,
  /\bapplySyncObject\b/,
  /\bbuildReviewQueue\b/,
  /\bscheduleNextReview\b/,
  /\bselectNextReview\b/,
  /\bcomputeReviewSchedule\b/,
  /\bcreateTableSql\b/,
  /\balterTableSql\b/
];

function productionJavaFiles() {
  return fs.readdirSync(JAVA_ROOT)
    .filter((entry) => entry.endsWith('.java'))
    .sort();
}

function classifiedFiles() {
  return Object.values(CLASSIFICATIONS).flat().sort();
}

function duplicateClassifications() {
  const counts = new Map();
  for (const file of classifiedFiles()) counts.set(file, (counts.get(file) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([file]) => file);
}

describe('Android Java adapter boundary', () => {
  it('keeps every production Java class explicitly classified by adapter responsibility', () => {
    expect(duplicateClassifications()).toEqual([]);
    expect(productionJavaFiles()).toEqual(classifiedFiles());
  });

  it('keeps removed Android business-rule forks out of the production host', () => {
    const files = productionJavaFiles();
    expect(files.filter((file) => REMOVED_BUSINESS_FORKS.includes(file))).toEqual([]);
  });

  it('blocks obvious sync conflict, review scheduling, and schema authoring rules in Java', () => {
    const matches = productionJavaFiles().flatMap((file) => {
      const source = fs.readFileSync(path.join(JAVA_ROOT, file), 'utf8');
      return FORBIDDEN_BUSINESS_RULE_PATTERNS
        .filter((pattern) => pattern.test(source))
        .map((pattern) => ({ file, pattern: pattern.source }));
    });

    expect(matches).toEqual([]);
  });
});
