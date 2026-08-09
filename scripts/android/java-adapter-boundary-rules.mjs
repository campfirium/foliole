export const CLASSIFICATIONS = {
  asset_support: {
    responsibility: 'Read packaged assets and validate file payloads without owning active-library data.',
    files: [
      'FolioleCompanionAssetReader.java',
      'FolioleCompanionAttachmentResourceHash.java',
      'FolioleCompanionContentBlobCasRules.java',
      'FolioleCompanionJsonAssetCache.java'
    ]
  },
  bridge_contract_metadata: {
    responsibility: 'Expose generated bridge metadata to thin native callers without redefining contracts.',
    files: [
      'FolioleCompanionBridgeContractAsset.java',
      'FolioleCompanionBridgeContractDefinitions.java',
      'FolioleCompanionHostBridgeContractDefinitions.java',
      'FolioleCompanionQueryAssetKeys.java',
      'FolioleCompanionQueryDefinitionShapeKeys.java',
      'FolioleCompanionResourceQueryStringKeys.java',
      'FolioleCompanionResourceReadQueryRules.java',
      'FolioleCompanionSyncPackContract.java',
      'FolioleCompanionSyncPackProviderDefinitions.java',
      'FolioleCompanionSyncProtocolDefinitions.java'
    ]
  },
  bridge_plugin_adapter: {
    responsibility: 'Land Capacitor calls into Android network, credentials, file, and isolated-pack services.',
    files: [
      'FolioleCompanionAppDataPlugin.java',
      'FolioleCompanionBootstrapPlugin.java',
      'FolioleCompanionPairingPluginActions.java',
      'FolioleCompanionPluginErrors.java',
      'FolioleCompanionResourcePluginActions.java',
      'FolioleCompanionSyncPackTransferPlugin.java',
      'FolioleCompanionSyncPlugin.java'
    ]
  },
  host_platform_adapter: {
    responsibility: 'Wrap Android identity, network, credentials, app-private files, and lifecycle APIs.',
    files: [
      'FolioleCompanionAppDataStore.java',
      'FolioleCompanionAttachmentFileResolver.java',
      'FolioleCompanionAttachmentFileStage.java',
      'FolioleCompanionAttachmentResourceBatchSessions.java',
      'FolioleCompanionAttachmentResourceBatchStore.java',
      'FolioleCompanionBootstrapState.java',
      'FolioleCompanionContentBlobBatchSessions.java',
      'FolioleCompanionContentBlobBatchStore.java',
      'FolioleCompanionContentBlobBatchText.java',
      'FolioleCompanionContentBlobMultipartBatch.java',
      'FolioleCompanionDesktopHttpClient.java',
      'FolioleCompanionHttpRequest.java',
      'FolioleCompanionHttpResponse.java',
      'FolioleCompanionNetworkPluginActions.java',
      'FolioleCompanionNsdAdvertisement.java',
      'FolioleCompanionNsdDiscovery.java',
      'FolioleCompanionPairingCrypto.java',
      'FolioleCompanionPairingMetadata.java',
      'FolioleCompanionPairingPeerContractDefinitions.java',
      'FolioleCompanionPairingProtocolStore.java',
      'FolioleCompanionPairingStore.java',
      'FolioleCompanionSyncGroupJoinGrantStore.java',
      'FolioleCompanionSyncGroupJoinRequest.java',
      'FolioleCompanionSyncGroupOutboundPeerStore.java',
      'FolioleCompanionSyncGroupPairCrypto.java',
      'FolioleCompanionSyncGroupPeerStore.java',
      'FolioleCompanionSyncGroupProvider.java',
      'FolioleCompanionSyncGroupRequestAuth.java',
      'FolioleCompanionSyncScreenAwake.java',
      'FolioleCompanionSyncGroupServer.java',
      'FolioleCompanionSyncPackEnvelopeValidator.java',
      'FolioleCompanionSyncPackTransfer.java',
      'FolioleCompanionWebView.java',
      'MainActivity.java'
    ]
  },
  active_library_sqlite_adapter: {
    responsibility: 'Read provider facts and membership from the active library through fixed shared SQL definitions.',
    files: [
      'FolioleCompanionSyncGroupDatabase.java',
      'FolioleCompanionSyncGroupResources.java'
    ]
  },
  isolated_pack_sqlite: {
    responsibility: 'Create or validate isolated temporary SQLite packs without opening the active library.',
    files: [
      'FolioleCompanionContentBlobPack.java',
      'FolioleCompanionSyncGroupContentBlobBatch.java',
      'FolioleCompanionSyncPackDatabaseValidator.java',
      'FolioleCompanionSyncPackPayloadWriter.java',
      'FolioleCompanionSyncPackProvider.java'
    ]
  }
};

export const REMOVED_BUSINESS_FORKS = [
  'FolioleCompanionDatabaseHelper.java',
  'FolioleCompanionDatabasePlugin.java',
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

export function inspectJavaAdapterBoundarySource(file, source) {
  return FORBIDDEN_BUSINESS_RULE_PATTERNS
    .filter((pattern) => pattern.test(`${file}\n${source}`))
    .map((pattern) => ({ file, kind: 'forbidden_business_rule', pattern: pattern.source }));
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
