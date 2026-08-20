import { ANDROID_COMPANION_CONVERGENCE_MIGRATION_ACTION_TYPES } from './androidCompanionConvergenceMigrationDefinitions.js';
import {
  ANDROID_COMPANION_DELIVERY_AUTHORIZATION_ACTION_TYPES,
  ANDROID_COMPANION_DELIVERY_AUTHORIZATION_PLAN_STEP
} from './androidCompanionDeliveryAuthorizationMigration.js';
import {
  ANDROID_COMPANION_EXTERNAL_FOLDER_OWNERSHIP_ACTION_TYPES,
  ANDROID_COMPANION_EXTERNAL_FOLDER_OWNERSHIP_PLAN_STEP
} from './androidCompanionExternalFolderOwnershipMigration.js';
import {
  ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_ACTION_TYPES,
  ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_PLAN_STEP
} from './androidCompanionNodeProvenanceMigration.js';
import {
  ANDROID_COMPANION_WORKGROUP_KEY_MIGRATION_ACTION_TYPES,
  ANDROID_COMPANION_WORKGROUP_KEY_MIGRATION_PLAN_STEP
} from './androidCompanionWorkgroupKeyMigration.js';
import {
  COMPANION_SOURCE_HOST_OWNERSHIP_ACTION_TYPES,
  COMPANION_SOURCE_HOST_OWNERSHIP_PLAN_STEP
} from './companionSourceHostOwnershipMigration.js';

export const ANDROID_COMPANION_MIGRATION_ACTION_TYPES = {
  ...ANDROID_COMPANION_CONVERGENCE_MIGRATION_ACTION_TYPES,
  ...ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_ACTION_TYPES,
  ...ANDROID_COMPANION_EXTERNAL_FOLDER_OWNERSHIP_ACTION_TYPES,
  ...ANDROID_COMPANION_WORKGROUP_KEY_MIGRATION_ACTION_TYPES,
  ...ANDROID_COMPANION_DELIVERY_AUTHORIZATION_ACTION_TYPES,
  ...COMPANION_SOURCE_HOST_OWNERSHIP_ACTION_TYPES,
  addNodesEnableShortTermIfMissing: 'addNodesEnableShortTermIfMissing',
  addNodesSequentialReadingEnabledIfMissing: 'addNodesSequentialReadingEnabledIfMissing',
  addNodesShelvedAtIfMissing: 'addNodesShelvedAtIfMissing',
  addNodesManualChildOrderIfMissing: 'addNodesManualChildOrderIfMissing',
  addNodeViewStateSourceIfMissing: 'addNodeViewStateSourceIfMissing',
  addSyncBaseContentHashIfMissing: 'addSyncBaseContentHashIfMissing',
  backfillNodeAttachmentsFromVersions: 'backfillNodeAttachmentsFromVersions',
  installSchema: 'installSchema',
  replaceSyncPushAck: 'replaceSyncPushAck',
  migrateHostPermanentState: 'migrateHostPermanentState',
  migrateAuthorHostSnapshots: 'migrateAuthorHostSnapshots',
  migrateSyncGroupHosts: 'migrateSyncGroupHosts',
  migrateOpaqueSyncRefs: 'migrateOpaqueSyncRefs',
  migrateSyncObjectStateSequence: 'migrateSyncObjectStateSequence'
} as const;

export const ANDROID_COMPANION_MIGRATION_PLAN = [
  ANDROID_COMPANION_EXTERNAL_FOLDER_OWNERSHIP_PLAN_STEP,
  step(4, 'installSchema', 'Failed to upgrade companion schema.'),
  {
    actions: [
      { type: 'migrateSyncObjectStateSequence' },
      { errorMessage: 'Failed to upgrade companion sync schema.', type: 'installSchema' }
    ],
    beforeVersion: 5
  },
  step(6, 'installSchema', 'Failed to upgrade companion node version schema.'),
  step(7, 'installSchema', 'Failed to upgrade companion review log schema.'),
  step(8, 'installSchema', 'Failed to upgrade companion attachment link schema.'),
  { actions: [{ type: 'backfillNodeAttachmentsFromVersions' }], beforeVersion: 9 },
  step(10, 'installSchema', 'Failed to upgrade companion content blob schema.'),
  step(11, 'installSchema', 'Failed to upgrade companion content blob data schema.'),
  {
    actions: [
      { errorMessage: 'Failed to upgrade companion view state source schema.', type: 'installSchema' },
      { type: 'addNodeViewStateSourceIfMissing' }
    ],
    beforeVersion: 12
  },
  {
    actions: [
      { errorMessage: 'Failed to upgrade companion push base reference schema.', type: 'installSchema' },
      { type: 'addSyncBaseContentHashIfMissing' }
    ],
    beforeVersion: 13
  },
  step(14, 'installSchema', 'Failed to upgrade companion push ack schema.'),
  step(15, 'installSchema', 'Failed to upgrade companion core indexes.'),
  {
    actions: [
      { errorMessage: 'Failed to upgrade companion node scheduling schema.', type: 'installSchema' },
      { type: 'addNodesEnableShortTermIfMissing' }
    ],
    beforeVersion: 16
  },
  {
    actions: [
      { errorMessage: 'Failed to upgrade companion sequential reading schema.', type: 'installSchema' },
      { type: 'addNodesSequentialReadingEnabledIfMissing' }
    ],
    beforeVersion: 17
  },
  {
    actions: [
      { errorMessage: 'Failed to upgrade companion shelved topic schema.', type: 'installSchema' },
      { type: 'addNodesManualChildOrderIfMissing' },
      { type: 'addNodesShelvedAtIfMissing' }
    ],
    beforeVersion: 18
  },
  ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_PLAN_STEP,
  step(20, 'installSchema', 'Failed to upgrade companion node open state schema.'),
  {
    actions: [
      { errorMessage: 'Failed to install companion sync convergence schema.', type: 'installSchema' },
      { type: 'addNodesAnchorResolutionStatusIfMissing' },
      { type: 'addNodesAnchorSourceVersionIdIfMissing' },
      { type: 'addNodeSyncVersionsBodyTextIfMissing' },
      { type: 'backfillSyncConflictConvergence' }
    ],
    beforeVersion: 22
  },
  step(23, 'installSchema', 'Failed to install companion Sync Group schema.'),
  step(24, 'replaceSyncPushAck', 'Failed to replace the legacy sync receipt schema.'),
  step(25, 'installSchema', 'Failed to install Sync Group departure facts.'),
  ANDROID_COMPANION_WORKGROUP_KEY_MIGRATION_PLAN_STEP,
  step(27, 'migrateHostPermanentState', 'Failed to cut over companion Host permanent state.'),
  step(28, 'migrateOpaqueSyncRefs', 'Failed to cut over companion opaque sync references.'),
  step(29, 'migrateAuthorHostSnapshots', 'Failed to cut over companion author Host snapshots.'),
  step(30, 'migrateSyncGroupHosts', 'Failed to cut over companion Sync Group Hosts.'),
  ANDROID_COMPANION_DELIVERY_AUTHORIZATION_PLAN_STEP,
  COMPANION_SOURCE_HOST_OWNERSHIP_PLAN_STEP
] as const;

function step(beforeVersion: number, type: string, errorMessage: string) {
  return { actions: [{ errorMessage, type }], beforeVersion } as const;
}
