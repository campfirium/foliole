import type { DbPort } from '../sync/dbPort.js';

import {
  ANDROID_COMPANION_MIGRATION_ACTION_TYPES as ACTIONS,
  ANDROID_COMPANION_MIGRATION_PLAN,
  ANDROID_COMPANION_MIGRATION_REPAIR_RULES as REPAIRS,
  ANDROID_COMPANION_MIGRATION_SCHEMA_STATEMENTS as STATEMENTS
} from './androidCompanionMigrationSchemaStatements.js';
import { migrateCompanionAuthorHostSnapshots } from './companionAuthorHostSnapshotsMigration.js';
import {
  addColumnIfMissing,
  backfillNodeAttachments,
  installCompanionSchema,
  migrateExternalFolderOwnership,
  replaceLegacySyncPushAck,
  migrateSyncObjectStateSequence
} from './companionDatabaseMigrationActions.js';
import { migrateCompanionHostPermanentState } from './companionHostPermanentStateMigration.js';
import { migrateCompanionOpaqueSyncRefs } from './companionOpaqueSyncRefsMigration.js';
import { migrateCompanionSyncGroupHosts } from './companionSyncGroupHostsMigration.js';

type MigrationAction = (typeof ANDROID_COMPANION_MIGRATION_PLAN)[number]['actions'][number];
type RepairName = keyof typeof REPAIRS;

const COLUMN_ACTIONS: Partial<Record<string, RepairName>> = {
  [ACTIONS.addNodeSyncVersionsBodyTextIfMissing]: 'nodeSyncVersionsBodyText',
  [ACTIONS.addNodeViewStateSourceIfMissing]: 'nodeViewStateSource',
  [ACTIONS.addNodesAnchorResolutionStatusIfMissing]: 'nodesAnchorResolutionStatus',
  [ACTIONS.addNodesAnchorSourceVersionIdIfMissing]: 'nodesAnchorSourceVersionId',
  [ACTIONS.addNodesEnableShortTermIfMissing]: 'nodesEnableShortTerm',
  [ACTIONS.addNodesImportContentFingerprintIfMissing]: 'nodesImportContentFingerprint',
  [ACTIONS.addNodesImportSourceFingerprintIfMissing]: 'nodesImportSourceFingerprint',
  [ACTIONS.addNodesManualChildOrderIfMissing]: 'nodesManualChildOrder',
  [ACTIONS.addNodesSequentialReadingEnabledIfMissing]: 'nodesSequentialReadingEnabled',
  [ACTIONS.addNodesShelvedAtIfMissing]: 'nodesShelvedAt',
  [ACTIONS.addSyncBaseContentHashIfMissing]: 'syncBaseContentHash',
  [ACTIONS.addSyncGroupsWorkgroupKeyIfMissing]: 'syncGroupsWorkgroupKey'
};

export async function migrateCompanionDatabase(
  db: DbPort,
  currentVersion: number,
  targetVersion: number,
  beforeVersionCommit?: () => void | Promise<void>
) {
  for (const step of ANDROID_COMPANION_MIGRATION_PLAN) {
    if (currentVersion >= step.beforeVersion) continue;
    for (const action of step.actions) await runMigrationAction(db, action);
  }
  await repairCompanionDatabase(db);
  await beforeVersionCommit?.();
  await db.run(`PRAGMA user_version = ${targetVersion}`);
}

export async function createCompanionDatabase(
  db: DbPort,
  targetVersion: number,
  beforeVersionCommit?: () => void | Promise<void>
) {
  await installCompanionSchema(db);
  await repairCompanionDatabase(db);
  await beforeVersionCommit?.();
  await db.run(`PRAGMA user_version = ${targetVersion}`);
}

export async function repairCompanionDatabase(db: DbPort) {
  await installCompanionSchema(db);
  for (const name of Object.keys(REPAIRS) as RepairName[]) {
    const rule = REPAIRS[name];
    if ('statementName' in rule) await addColumnIfMissing(db, rule);
  }
}

async function runMigrationAction(db: DbPort, action: MigrationAction) {
  const repairName = COLUMN_ACTIONS[action.type];
  if (repairName) {
    const rule = REPAIRS[repairName];
    if ('statementName' in rule) return addColumnIfMissing(db, rule);
  }
  if (action.type === ACTIONS.installSchema) return installCompanionSchema(db);
  if (action.type === ACTIONS.migrateSyncObjectStateSequence) return migrateSyncObjectStateSequence(db);
  if (action.type === ACTIONS.migrateHostPermanentState) return migrateCompanionHostPermanentState(db);
  if (action.type === ACTIONS.migrateAuthorHostSnapshots) return migrateCompanionAuthorHostSnapshots(db);
  if (action.type === ACTIONS.migrateOpaqueSyncRefs) return migrateCompanionOpaqueSyncRefs(db);
  if (action.type === ACTIONS.migrateSyncGroupHosts) return migrateCompanionSyncGroupHosts(db);
  if (action.type === ACTIONS.backfillNodeAttachmentsFromVersions) return backfillNodeAttachments(db);
  if (action.type === ACTIONS.migrateExternalFolderOwnership) return migrateExternalFolderOwnership(db);
  if (action.type === ACTIONS.replaceSyncPushAck) return replaceLegacySyncPushAck(db);
  if (action.type === ACTIONS.backfillSyncConflictConvergence) {
    await db.run(STATEMENTS.syncVersionParentsBackfill);
    await db.run(STATEMENTS.syncCurrentVersionBodyTextBackfill);
    return;
  }
  throw new Error(`Unsupported companion migration action: ${action.type}`);
}
