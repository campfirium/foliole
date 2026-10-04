import { PARENT_ORDER_VERSION_SCHEMA } from '../sync/syncParentOrderVersionStore.js';

import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from './androidCompanionCoreSchemaStatements.js';
import { ANDROID_COMPANION_HOST_SCHEMA_STATEMENTS } from './androidCompanionHostSchemaStatements.js';
import { ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS } from './androidCompanionResourceSchemaStatements.js';
import { ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS } from './androidCompanionSyncSchemaStatements.js';
import { FOREGROUND_TIME_SCHEMA } from './foregroundTimeSchema.js';
import { isLegacyOrderingSchema } from './legacyStorageRetirementMigration.js';
import { NODE_VERSION_MEMBER_POSITION_SCHEMA } from './nodeVersionMemberPositionSchema.js';
import { NODE_VERSION_RETENTION_INDEX_SCHEMA } from './nodeVersionRetentionIndexSchema.js';
import { NODE_VERSION_RETENTION_SCHEMA_STATEMENTS } from './nodeVersionRetentionSchemaStatements.js';
import { PDF_INDEX_STATE_SCHEMA_STATEMENTS } from './pdfIndexStateSchema.js';
import { isRetiredAttachmentSchema } from './retiredAttachmentSchema.js';
import { REVIEW_DAILY_COUNT_SCHEMA } from './reviewDailyCountSchema.js';
import { SYNC_DELIVERY_TRIGGER_STATEMENTS } from './syncDeliveryTriggerStatements.js';
import { SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS } from './syncGroupRestoreSchemaStatements.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from './syncGroupSchemaStatements.js';
import { SYNC_IDENTITY_ENTITY_TRIGGER_STATEMENTS } from './syncIdentityEntityTriggerStatements.js';
import { SYNC_IDENTITY_FACT_STAGING_SCHEMA } from './syncIdentityFactStagingSchema.js';
import { SYNC_IDENTITY_INDEX_SCHEMA_STATEMENTS } from './syncIdentityIndexSchemaStatements.js';
import { SYNC_IDENTITY_RECEIPT_SCHEMA_STATEMENTS } from './syncIdentityReceiptSchemaStatements.js';
import { SYNC_PACK_DEPENDENCY_STAGING_SCHEMA } from './syncPackDependencyStagingSchema.js';
import { SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS } from './syncPackProgressSchemaStatements.js';

export const ANDROID_COMPANION_SCHEMA_STATEMENTS = [
  ...ANDROID_COMPANION_HOST_SCHEMA_STATEMENTS,
  ...ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS,
  ...NODE_VERSION_RETENTION_INDEX_SCHEMA,
  ...REVIEW_DAILY_COUNT_SCHEMA,
  ...FOREGROUND_TIME_SCHEMA,
  ...ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS,
  ...PDF_INDEX_STATE_SCHEMA_STATEMENTS,
  ...ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS,
  ...SYNC_IDENTITY_INDEX_SCHEMA_STATEMENTS,
  ...SYNC_IDENTITY_FACT_STAGING_SCHEMA,
  ...SYNC_IDENTITY_RECEIPT_SCHEMA_STATEMENTS,
  ...SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS,
  ...SYNC_PACK_DEPENDENCY_STAGING_SCHEMA,
  ...SYNC_GROUP_SCHEMA_STATEMENTS,
  ...SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS,
  ...NODE_VERSION_RETENTION_SCHEMA_STATEMENTS,
  ...NODE_VERSION_MEMBER_POSITION_SCHEMA,
  ...PARENT_ORDER_VERSION_SCHEMA,
  ...SYNC_DELIVERY_TRIGGER_STATEMENTS,
  ...SYNC_IDENTITY_ENTITY_TRIGGER_STATEMENTS
].filter((statement) => !isRetiredAttachmentSchema(statement) && !isLegacyOrderingSchema(statement));
