// The phone statement budget (WA-057): a change to a phone write chain reruns the statement count of every
// everyday phone action, so a write that grows by dozens of bridge round trips fails before it is committed.
// The whole file runs in about 8 seconds on the Mac mini.
// The same chains rerun the library-scale check, which fails when bridge round trips, rows or bytes follow content the
// action never touches. It runs in under a minute.
const PHONE_STATEMENT_BUDGET_TESTS = [
  'src/companion/companionActionSqlStatements.budget.integration.test.ts',
  'src/companion/companionActionScale.integration.test.ts'
];

const source = (pattern) => new RegExp(`^(?:${pattern})(?<!\\.test\\.ts)(?<!\\.test\\.tsx)$`, 'u');

export const PHONE_STATEMENT_CRITICAL_TEST_ROUTES = [
  {
    triggers: [
      source(String.raw`lib/core/sync/[^/]+\.ts`),
      source(String.raw`lib/core/flow/[^/]+\.ts`),
      source(String.raw`lib/core/database/orphanedInactiveReadingState\.ts`),
      source(String.raw`src/shared/platform/companion/(?:runtime|editing|sync/workspace-state)/[^/]+\.ts`),
      source(String.raw`src/shared/platform/(?:companionSyncNodeVersions|companionSyncStateWriters|companionSyncWriterQueue|capacitorSqliteDbPort)\.ts`),
      source(String.raw`src/companion/(?:companionFlowMutation|companionReviewSession|companionTrashActions|companionCaptureTextActions)\.ts`),
      source(String.raw`src/companion/(?:companionActionScenarios|companionBridgeMeter)\.testSupport\.ts`)
    ],
    tests: PHONE_STATEMENT_BUDGET_TESTS
  }
];
