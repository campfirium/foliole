// The desktop write statement budget (WA-063..065): a change to a desktop write chain reruns the statement count of
// every everyday desktop write, so a move, Trash, metadata or body write that grows per node fails before it is
// committed. The whole file runs in about 6 seconds on the Mac mini.
const DESKTOP_STATEMENT_BUDGET_TESTS = [
  'electron/ipc/storageCommandSqlBudget.writes.test.ts'
];

const source = (pattern) => new RegExp(`^(?:${pattern})(?<!\\.test\\.ts)$`, 'u');

export const DESKTOP_STATEMENT_CRITICAL_TEST_ROUTES = [
  {
    triggers: [
      source(String.raw`lib/core/database/(?:nodeMove[^/]*|nodeMutations|nodeTrash[^/]*|nodeRestore[^/]*|restoredChildOrders|restoreDeletedParentOrders|currentParentOrderStore|parentOrderWriter|parentChildOrder|parentContentMutation|nodeVersionChainRetention|releasedVersionBodyHashes|textBodyBlobCollection|searchIndexInvalidations|workspaceSearchSourceState|nodeSearchInvalidationForMutation|syncState|syncHostIdentity|reviewMutations)\.ts`),
      source(String.raw`lib/core/sync/(?:localContentEdit[^/]*|nodeVersion[^/]*|syncNodeGraph|topicBodyRetentionPlan|requestSyncBody[^/]*)\.ts`),
      source(String.raw`electron/database/(?:nodeMutations|nodeVersionedMutations|nodeTrashTransitions|nodeSyncVersion[^/]*|nodeSyncStateRows|reviewMutations|hostProfile|sourceDispositionStates)\.ts`),
      source(String.raw`electron/mirror/(?:mirrorNodeMove|mirrorArticleResolver)\.ts`),
      source(String.raw`electron/ipc/(?:storageNodeMutationCommands|storageLocalContentEditCommand|storageReadCommands|nodeCommandArgs)\.ts`)
    ],
    tests: DESKTOP_STATEMENT_BUDGET_TESTS
  }
];
