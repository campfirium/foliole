export const CLASSIFICATIONS = {
  asset_support: {
    responsibility: 'Read packaged assets and validate file payloads without owning active-library data.',
    files: [
      'FolioleCompanionAssetReader.java',
      'FolioleCompanionAttachmentResourceHash.java',
      'FolioleCompanionCanonicalAttachmentKey.java',
      'FolioleCompanionJsonAssetCache.java',
      'FolioleCompanionResourceAvailability.java'
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
      'FolioleCompanionSyncParticipationContractDefinitions.java',
      'FolioleCompanionSyncProtocolDefinitions.java'
    ]
  },
  bridge_plugin_adapter: {
    responsibility: 'Land Capacitor calls into Android network, credentials, file, and request-transfer services.',
    files: [
      'FolioleCompanionAppDataPlugin.java',
      'FolioleCompanionBootstrapPlugin.java',
      'FolioleCompanionPluginErrors.java',
      'FolioleCompanionResourcePluginActions.java',
      'FolioleCompanionShareInboxPlugin.java',
      'FolioleCompanionSyncParticipationActions.java',
      'FolioleCompanionSyncAsync.java',
      'FolioleCompanionSyncPlugin.java',
      'FolioleCompanionSyncTrigger.java'
    ]
  },
  host_platform_adapter: {
    responsibility: 'Wrap Android identity, network, credentials, app-private files, and lifecycle APIs.',
    files: [
      'FolioleCompanionAppDataStore.java',
      'FolioleCompanionAttachmentFileResolver.java',
      'FolioleCompanionAttachmentFileStage.java',
      'FolioleCompanionBootstrapState.java',
      'FolioleCompanionCurrentGroupCredential.java',
      'FolioleCompanionDeviceAnchorStore.java',
      'FolioleCompanionDesktopHttpClient.java',
      'FolioleCompanionFramedSyncFileActions.java',
      'FolioleCompanionFramedSyncPayloadBudgetActions.java',
      'FolioleCompanionFramedSyncDocumentLifecycle.java',
      'FolioleCompanionSyncPluginEvents.java',
      'FolioleCompanionSyncGroupDataPending.java',
      'FolioleCompanionFramedSyncRoute.java',
      'FolioleCompanionRequestSyncHttp.java',
      'FolioleRequestSyncHttpChunks.java',
      'FolioleRequestSyncRoute.java',
      'FolioleRequestSyncTiming.java',
      'FolioleCompanionFramedHttpBody.java',
      'FolioleCompanionHttpBodyStream.java',
      'FolioleCompanionHttpRequest.java',
      'FolioleCompanionHttpResponse.java',
      'FolioleCompanionJoinRequest.java',
      'FolioleCompanionJoinRequestProvider.java',
      'FolioleCompanionLatestServiceQueue.java',
      'FolioleCompanionNetworkPluginActions.java',
      'FolioleCompanionNsdAddresses.java',
      'FolioleCompanionNsdAdvertisement.java',
      'FolioleCompanionNsdDiscovery.java',
      'FolioleCompanionNsdDiscoverySession.java',
      'FolioleCompanionNsdProtocolTxt.java',
      'FolioleCompanionNsdServiceCandidates.java',
      'FolioleCompanionResourceFailure.java',
      'FolioleCompanionShareInboxStore.java',
      'FolioleCompanionSyncDeviceIdentity.java',
      'FolioleCompanionSyncGroupDataBridge.java',
      'FolioleCompanionSyncGroupCrypto.java',
      'FolioleCompanionSyncGroupHmac.java',
      'FolioleCompanionSyncGroupJoinCrypto.java',
      'FolioleCompanionSyncGroupProvider.java',
      'FolioleCompanionSyncGroupRequestAuth.java',
      'FolioleCompanionSyncGroupSigning.java',
      'FolioleCompanionSyncScreenAwake.java',
      'FolioleCompanionSyncGroupServer.java',
      'FolioleCompanionSyncGroupHttpError.java',
      'FolioleCompanionSyncGroupSessionAuth.java',
      'FolioleCompanionSyncParticipationStore.java',
      'FolioleCompanionWorkgroupHttp.java',
      'FolioleCompanionWebView.java',
      'FolioleRemoteImageFiles.java',
      'FolioleAttachmentMaintenanceFiles.java',
      'FolioleAttachmentBlockFiles.java',
      'MainActivity.java'
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
