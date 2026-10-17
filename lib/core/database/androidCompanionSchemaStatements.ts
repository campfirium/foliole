import { PDF_TEXT_ARTIFACT_SCHEMA } from '../sync/pdfTextArtifact.js';


import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from './androidCompanionCoreSchemaStatements.js';
import { ANDROID_COMPANION_HOST_SCHEMA_STATEMENTS } from './androidCompanionHostSchemaStatements.js';
import { ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS } from './androidCompanionResourceSchemaStatements.js';
import { ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS } from './androidCompanionSyncSchemaStatements.js';
import { ATTACHMENT_DEMAND_SCHEMA } from './attachmentDemandSchema.js';
import { CURRENT_PARENT_ORDER_SCHEMA } from './currentParentOrderSchema.js';
import { FOREGROUND_TIME_SCHEMA } from './foregroundTimeSchema.js';
import { FRAMED_SYNC_DIGEST_SCHEMA } from './framedSyncDigestSchema.js';
import { FRAMED_SYNC_INVENTORY_TABLES } from './framedSyncInventorySchema.js';
import { isLegacyOrderingSchema } from './legacyStorageRetirementMigration.js';
import { NODE_VERSION_RETENTION_INDEX_SCHEMA } from './nodeVersionRetentionIndexSchema.js';
import { NODE_VERSION_RETENTION_SCHEMA_STATEMENTS } from './nodeVersionRetentionSchemaStatements.js';
import { PDF_INDEX_STATE_SCHEMA_STATEMENTS } from './pdfIndexStateSchema.js';
import { isRetiredAttachmentSchema } from './retiredAttachmentSchema.js';
import { isRetiredSyncSchema } from './retiredSyncSchema.js';
import { REVIEW_DAILY_COUNT_SCHEMA } from './reviewDailyCountSchema.js';
import { SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS } from './syncGroupRestoreSchemaStatements.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from './syncGroupSchemaStatements.js';

export const ANDROID_COMPANION_SCHEMA_STATEMENTS = [
  ...ANDROID_COMPANION_HOST_SCHEMA_STATEMENTS,
  ...ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS,
  ...NODE_VERSION_RETENTION_INDEX_SCHEMA,
  ...REVIEW_DAILY_COUNT_SCHEMA,
  ...FOREGROUND_TIME_SCHEMA,

  ...ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS,
  ...PDF_INDEX_STATE_SCHEMA_STATEMENTS,
  PDF_TEXT_ARTIFACT_SCHEMA,
  ...ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS,

  ...SYNC_GROUP_SCHEMA_STATEMENTS,
  ...SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS,
  ...NODE_VERSION_RETENTION_SCHEMA_STATEMENTS,
  ...CURRENT_PARENT_ORDER_SCHEMA,
  ...ATTACHMENT_DEMAND_SCHEMA,

  ...FRAMED_SYNC_INVENTORY_TABLES,
  ...FRAMED_SYNC_DIGEST_SCHEMA
].filter((statement) => !isRetiredAttachmentSchema(statement) && !isLegacyOrderingSchema(statement) && !isRetiredSyncSchema(statement));
