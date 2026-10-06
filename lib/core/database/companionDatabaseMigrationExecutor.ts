import type { DbPort } from '../sync/dbPort.js';

import {
  ANDROID_COMPANION_MIGRATION_ACTION_TYPES as ACTIONS,
  ANDROID_COMPANION_MIGRATION_PLAN,
  ANDROID_COMPANION_MIGRATION_REPAIR_RULES as REPAIRS,
  ANDROID_COMPANION_MIGRATION_SCHEMA_STATEMENTS as STATEMENTS
} from './androidCompanionMigrationSchemaStatements.js';
import { retireCompanionAttachmentManifest } from './attachmentManifestRetirementMigration.js';
import { retireCompanionAttachmentRegistry } from './companionAttachmentRegistryRetirement.js';
import { migrateCompanionAuthorHostSnapshots } from './companionAuthorHostSnapshotsMigration.js';
import {
  addColumnIfMissing,
  backfillNodeAttachments,
  installCompanionSchema,
  installLegacyAttachmentSchema,
  migrateExternalFolderOwnership,
  retireLegacySyncGroupState,
  replaceLegacySyncPushAck,
  migrateSyncObjectStateSequence
} from './companionDatabaseMigrationActions.js';
import { migrateCompanionDeliveryAuthorizations } from './companionDeliveryAuthorizationMigration.js';
import { migrateCompanionHostPermanentState } from './companionHostPermanentStateMigration.js';
import { migrateCompanionOpaqueSyncRefs } from './companionOpaqueSyncRefsMigration.js';
import { migrateCompanionParentChildOrder } from './companionParentChildOrderMigration.js';
import { migrateCompanionSourceHostOwnership } from './companionSourceHostOwnershipMigration.js';
import { migrateCompanionSyncGroupHosts } from './companionSyncGroupHostsMigration.js';
import { migrateCompanionWatchedBindings } from './companionWatchedBindingsMigration.js';
import { migrateCompanionDynamicNodeVersionChains } from './dynamicNodeVersionChainMigration.js';
import { migrateCompanionFramedSyncInventory } from './framedSyncInventoryMigration.js';
import { migrateCompanionIndependentNodeVersions } from './independentNodeVersionMigration.js';
import { retireCompanionLegacyStorage } from './legacyStorageRetirementMigration.js';
import { migrateCompanionNodeVersionConfirmations } from './nodeVersionConfirmationMigration.js';
import { migrateCompanionParentOrderVersions } from './parentOrderVersionMigration.js';
import { SYNC_IDENTITY_ENTITY_TRIGGER_STATEMENTS } from './syncIdentityEntityTriggerStatements.js';
import { repairCompanionSyncStateEntities } from './syncStateEntityRepair.js';

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
  [ACTIONS.addSyncGroupsWorkgroupKeyIfMissing]: 'syncGroupsWorkgroupKey',
  [ACTIONS.addImportSourcesRemoteProviderIfMissing]: 'importSourcesRemoteProvider',
  [ACTIONS.addImportSourcesRemoteConnectionRefIfMissing]: 'importSourcesRemoteConnectionRef',
  [ACTIONS.addImportSourcesRemoteDocumentIdIfMissing]: 'importSourcesRemoteDocumentId',
  [ACTIONS.addImportSourcesRemoteAnnotationsJsonIfMissing]: 'importSourcesRemoteAnnotationsJson',
  [ACTIONS.addImportSourcesRemoteImportStateJsonIfMissing]: 'importSourcesRemoteImportStateJson',
  [ACTIONS.addExternalDocumentsReferenceKindIfMissing]: 'externalDocumentsReferenceKind',
  [ACTIONS.addExternalDocumentsReferenceJsonIfMissing]: 'externalDocumentsReferenceJson',
  [ACTIONS.addWatchedBindingsOwnerIfMissing]: 'watchedBindingsOwner'
};

export async function migrateCompanionDatabase(
  db: DbPort,
  currentVersion: number,
  targetVersion: number,
  beforeVersionCommit?: () => void | Promise<void>
) {
  if (currentVersion < 56) await installLegacyAttachmentSchema(db);
  if (currentVersion < 40) await db.run(
    'CREATE TABLE IF NOT EXISTS node_order (node_id TEXT PRIMARY KEY REFERENCES nodes(id), position INTEGER NOT NULL)'
  );
  for (const step of ANDROID_COMPANION_MIGRATION_PLAN) {
    if (currentVersion >= step.beforeVersion) continue;
    for (const action of step.actions) {
      if (!isRetiredSyncStateMigration(action, targetVersion)) await runMigrationAction(db, action);
    }
  }
  await repairCompanionDatabase(db);
  if (currentVersion < 40 && targetVersion >= 40) await migrateCompanionParentChildOrder(db);
  if (currentVersion < 37 && targetVersion >= 37) await retireCompanionAttachmentManifest(db);
  if (currentVersion < 39 && targetVersion >= 39) await migrateCompanionWatchedDisplayPath(db);
  if (currentVersion < 38 && targetVersion >= 38) await migrateCompanionWatchedBindings(db);
  if (currentVersion < 56 && targetVersion >= 56) await retireCompanionAttachmentRegistry(db);
  if (currentVersion < 57 && targetVersion >= 57) await migrateCompanionDynamicNodeVersionChains(db);
  if (currentVersion < 58 && targetVersion >= 58) await repairCompanionSyncStateEntities(db);
  if (currentVersion < 59 && targetVersion >= 59) await migrateCompanionIndependentNodeVersions(db);
  if (currentVersion < 61 && targetVersion >= 61) await migrateCompanionNodeVersionConfirmations(db);
  if (currentVersion < 62 && targetVersion >= 62) await retireCompanionLegacyStorage(db);
  if (currentVersion < 64 && targetVersion >= 64) await migrateCompanionParentOrderVersions(db);
  if (targetVersion >= 63) await installSyncIdentityEntityTriggers(db);
  if (currentVersion < 71 && targetVersion >= 71) await migrateCompanionFramedSyncInventory(db);
  await beforeVersionCommit?.();
  await db.run(`PRAGMA user_version = ${targetVersion}`);
}

async function migrateCompanionWatchedDisplayPath(db: DbPort) {
  const columns = await db.query<{ name: string }>("PRAGMA table_info('watched_folder_bindings')");
  if (!columns.some((column) => column.name === 'local_rule_id')) {
    await db.run('ALTER TABLE watched_folder_bindings ADD COLUMN local_rule_id TEXT');
  }
  if (!columns.some((column) => column.name === 'reported_path')) {
    await db.run("ALTER TABLE watched_folder_bindings ADD COLUMN reported_path TEXT NOT NULL DEFAULT ''");
  }
}

export async function createCompanionDatabase(
  db: DbPort,
  targetVersion: number,
  beforeVersionCommit?: () => void | Promise<void>
) {
  await installCompanionSchema(db);
  await repairCompanionDatabase(db);
  if (targetVersion >= 63) await installSyncIdentityEntityTriggers(db);
  if (targetVersion >= 71) await migrateCompanionFramedSyncInventory(db);
  await beforeVersionCommit?.();
  await db.run(`PRAGMA user_version = ${targetVersion}`);
}

async function installSyncIdentityEntityTriggers(db: DbPort) {
  for (const statement of SYNC_IDENTITY_ENTITY_TRIGGER_STATEMENTS) await db.run(statement);
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
  if (action.type === ACTIONS.retireLegacySyncGroupState) return retireLegacySyncGroupState(db);
  if (action.type === ACTIONS.migrateSyncObjectStateSequence) return migrateSyncObjectStateSequence(db);
  if (action.type === ACTIONS.migrateHostPermanentState) return migrateCompanionHostPermanentState(db);
  if (action.type === ACTIONS.migrateAuthorHostSnapshots) return migrateCompanionAuthorHostSnapshots(db);
  if (action.type === ACTIONS.migrateDeliveryAuthorizations) {
    return migrateCompanionDeliveryAuthorizations(db);
  }
  if (action.type === ACTIONS.migrateOpaqueSyncRefs) return migrateCompanionOpaqueSyncRefs(db);
  if (action.type === ACTIONS.migrateSyncGroupHosts) return migrateCompanionSyncGroupHosts(db);
  if (action.type === ACTIONS.migrateSourceHostOwnership) return migrateCompanionSourceHostOwnership(db);
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

function isRetiredSyncStateMigration(action: MigrationAction, targetVersion: number) {
  if (targetVersion < 33) return false;
  return action.type === ACTIONS.replaceSyncPushAck ||
    action.type === ACTIONS.addSyncGroupsWorkgroupKeyIfMissing ||
    action.type === ACTIONS.migrateSyncGroupHosts ||
    action.type === ACTIONS.migrateDeliveryAuthorizations;
}
