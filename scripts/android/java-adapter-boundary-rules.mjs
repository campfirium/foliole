export const CLASSIFICATIONS = {
  asset_support: {
    responsibility: 'Read packaged assets and parse primitive host payload helpers without owning domain rules.',
    files: [
      'FolioleCompanionAssetReader.java',
      'FolioleCompanionAttachmentResourceHash.java',
      'FolioleCompanionContentBlobCasRules.java',
      'FolioleCompanionJsonAssetCache.java',
      'FolioleCompanionJsonValueParser.java',
      'FolioleCompanionSyncContentHash.java'
    ]
  },
  bridge_contract_metadata: {
    responsibility: 'Expose generated bridge metadata to tests and native callers without redefining contracts.',
    files: [
      'FolioleCompanionBridgeContractAsset.java',
      'FolioleCompanionBridgeContractDefinitions.java',
      'FolioleCompanionHostBridgeContractDefinitions.java'
    ]
  },
  bridge_plugin_adapter: {
    responsibility: 'Land Capacitor plugin calls into Android host services and return bridge payloads.',
    files: [
      'FolioleCompanionAppDataPlugin.java',
      'FolioleCompanionAlternativePlugin.java',
      'FolioleCompanionBootstrapPlugin.java',
      'FolioleCompanionDatabasePlugin.java',
      'FolioleCompanionPairingPluginActions.java',
      'FolioleCompanionPluginErrors.java',
      'FolioleCompanionResourcePluginActions.java',
      'FolioleCompanionSyncDataPluginActions.java',
      'FolioleCompanionSyncPackTransferPlugin.java',
      'FolioleCompanionSyncPlugin.java',
      'FolioleCompanionSyncStatePluginActions.java',
      'FolioleCompanionWorkspaceSyncPluginActions.java'
    ]
  },
  generated_definition_reader: {
    responsibility: 'Read generated query, mutation, payload, and protocol definitions from bundled assets.',
    files: [
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
      'FolioleCompanionResourceQueryStringKeys.java',
      'FolioleCompanionResourceMutationRules.java',
      'FolioleCompanionResourceReadQueryRules.java',
      'FolioleCompanionRuntimeMutationRules.java',
      'FolioleCompanionRuntimeQueryRules.java',
      'FolioleCompanionSyncApplyMutationRules.java',
      'FolioleCompanionSyncConflictQueryRules.java',
      'FolioleCompanionSyncDiagnosticQueryRules.java',
      'FolioleCompanionSyncObjectQueryRules.java',
      'FolioleCompanionSyncPayloadRoutingRules.java',
      'FolioleCompanionSyncPackContract.java',
      'FolioleCompanionSyncProtocolDefinitions.java',
      'FolioleCompanionSyncPushAckRules.java',
      'FolioleCompanionSyncReviewLogRecordRules.java',
      'FolioleCompanionSyncSettingPayloadRules.java',
      'FolioleCompanionSyncStreamQueryRules.java',
      'FolioleCompanionSyncWriteRules.java',
      'FolioleCompanionViewStatePayloadRules.java',
      'FolioleCompanionWorkspaceReadQueryRules.java'
    ]
  },
  host_platform_adapter: {
    responsibility: 'Wrap Android storage, network, lifecycle, WebView, backup, pairing, and transfer APIs.',
    files: [
      'FolioleCompanionAppDataStore.java',
      'FolioleCompanionBootstrapState.java',
      'FolioleCompanionContentBlobBatchText.java',
      'FolioleCompanionContentBlobMultipartBatch.java',
      'FolioleCompanionDatabaseBackup.java',
      'FolioleCompanionDatabaseHelper.java',
      'FolioleCompanionDesktopHttpClient.java',
      'FolioleCompanionNetworkPluginActions.java',
      'FolioleCompanionNsdDiscovery.java',
      'FolioleCompanionPairingCrypto.java',
      'FolioleCompanionPairingMetadata.java',
      'FolioleCompanionPairingPeerContractDefinitions.java',
      'FolioleCompanionPairingProtocolStore.java',
      'FolioleCompanionPairingStore.java',
      'FolioleCompanionSyncPackEnvelopeValidator.java',
      'FolioleCompanionSyncPackTransfer.java',
      'FolioleCompanionWebView.java',
      'MainActivity.java'
    ]
  },
  migration_adapter: {
    responsibility: 'Install generated schema statements and run SQLite runtime probes only.',
    files: [
      'FolioleCompanionDatabaseMigration.java',
      'FolioleCompanionExternalFolderOwnershipMigration.java',
      'FolioleCompanionMigrationRowValues.java',
      'FolioleCompanionSchemaInstaller.java',
      'FolioleCompanionSchemaRepair.java',
      'FolioleCompanionSyncPackDatabaseValidator.java',
      'FolioleCompanionSqliteRuntime.java'
    ]
  },
  query_mutation_executor: {
    responsibility: 'Execute generated named queries and mutations against the Android SQLite runtime.',
    files: [
      'FolioleCompanionGeneratedMutationRunner.java',
      'FolioleCompanionGeneratedQueryRunner.java',
      'FolioleCompanionNamedMutationStore.java',
      'FolioleCompanionNamedQueryStore.java'
    ]
  },
  sync_diagnostic_adapter: {
    responsibility: 'Collect and format Android sync diagnostics without deciding sync truth.',
    files: [
      'FolioleCompanionSyncDiagnosticContent.java',
      'FolioleCompanionSyncDiagnosticMeta.java',
      'FolioleCompanionSyncDiagnosticState.java',
      'FolioleCompanionSyncDiagnosticStorage.java',
      'FolioleCompanionSyncDiagnosticVerdicts.java',
      'FolioleCompanionSyncDiagnostics.java'
    ]
  },
  store_executor: {
    responsibility: 'Persist and read resources, sync payloads, and host records as executor surfaces.',
    files: [
      'FolioleCompanionAttachmentResourceBatchStore.java',
      'FolioleCompanionAttachmentResourceBatchCommitStore.java',
      'FolioleCompanionAttachmentResourceBatchSessions.java',
      'FolioleCompanionAttachmentResourceMissingStore.java',
      'FolioleCompanionAttachmentResourceStore.java',
      'FolioleCompanionContentBlobBatchCommitStore.java',
      'FolioleCompanionContentBlobBatchManifestStore.java',
      'FolioleCompanionContentBlobBatchSessions.java',
      'FolioleCompanionContentBlobBatchStore.java',
      'FolioleCompanionContentBlobMissingStore.java',
      'FolioleCompanionContentBlobStore.java',
      'FolioleCompanionDocumentSyncPayload.java',
      'FolioleCompanionExternalDocumentStore.java',
      'FolioleCompanionLearningPayloadStore.java',
      'FolioleCompanionLearningSyncPayload.java',
      'FolioleCompanionMetaRecords.java',
      'FolioleCompanionNodeAttachmentStore.java',
      'FolioleCompanionNodeRekey.java',
      'FolioleCompanionNodeTextAlternativeStore.java',
      'FolioleCompanionPdfPageTextStore.java',
      'FolioleCompanionReadableArticleQuery.java',
      'FolioleCompanionSyncEventStore.java',
      'FolioleCompanionSyncMetaStore.java',
      'FolioleCompanionSyncNodeVersionStore.java',
      'FolioleCompanionSyncObjectStore.java',
      'FolioleCompanionSyncPayloadJson.java',
      'FolioleCompanionSyncPayloadQueryStore.java',
      'FolioleCompanionSyncPushAckStore.java',
      'FolioleCompanionSyncReviewLogStore.java',
      'FolioleCompanionSyncStateWriteStore.java',
      'FolioleCompanionTextBodyBlobs.java',
      'FolioleCompanionTopicSearchStore.java',
      'FolioleCompanionViewStateSyncStore.java',
      'FolioleCompanionWorkspaceNodeSnapshotBuilder.java',
      'FolioleCompanionWorkspaceSnapshotExporter.java',
      'FolioleCompanionWorkspaceViewStateExporter.java'
    ]
  }
};

export const REMOVED_BUSINESS_FORKS = [
  'FolioleCompanionSyncConflictStore.java',
  'FolioleCompanionSyncObjectApply.java',
  'FolioleCompanionSyncStateRows.java'
];

export const FORBIDDEN_BUSINESS_RULE_PATTERNS = [
  /\bconflict-copy-/,
  /\bchooseConflictWinner\b/,
  /\bresolveConflict\b/,
  /\bmergeConflict\b/,
  /\bapplySyncObject\b/,
  /\bSyncObject(?:Apply|Merger|Resolver)\b/,
  /\bConflict(?:Store|Resolver|Winner|Merger)\b/,
  /\bReview(?:Scheduler|QueueBuilder|ScheduleCalculator)\b/,
  /\bbuildReviewQueue\b/,
  /\bscheduleNextReview\b/,
  /\bselectNextReview\b/,
  /\bcomputeReviewSchedule\b/,
  /\bcreateTableSql\b/,
  /\balterTableSql\b/
];

const GENERATED_RESULT_FILTER_PATTERN =
  /FolioleCompanionGeneratedQueryRunner\.load\([\s\S]*?new\s+JSONArray\s*\(\)[\s\S]*?for\s*\([\s\S]*?\.length\s*\(\)[\s\S]*?if\s*\([\s\S]*?\)[\s\S]*?\.put\s*\(/u;

export function inspectJavaAdapterBoundarySource(file, source) {
  const violations = FORBIDDEN_BUSINESS_RULE_PATTERNS
    .filter((pattern) => pattern.test(`${file}\n${source}`))
    .map((pattern) => ({
      file,
      kind: 'forbidden_business_rule',
      pattern: pattern.source
    }));
  if (GENERATED_RESULT_FILTER_PATTERN.test(source)) {
    violations.push({
      file,
      kind: 'generated_result_filter',
      pattern: GENERATED_RESULT_FILTER_PATTERN.source
    });
  }
  return violations;
}

export function classifiedFiles() {
  return Object.values(CLASSIFICATIONS).flatMap((entry) => entry.files).sort();
}

export function classificationEntries() {
  return Object.entries(CLASSIFICATIONS).map(([kind, entry]) => ({
    kind,
    responsibility: entry.responsibility,
    files: [...entry.files].sort()
  }));
}
