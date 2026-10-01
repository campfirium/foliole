import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from './androidCompanionCoreSchemaStatements.js';
import { ANDROID_COMPANION_HOST_SCHEMA_STATEMENTS } from './androidCompanionHostSchemaStatements.js';
import { ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS } from './androidCompanionResourceSchemaStatements.js';
import { ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS } from './androidCompanionSyncSchemaStatements.js';
import { NODE_VERSION_RETENTION_SCHEMA_STATEMENTS } from './nodeVersionRetentionSchemaStatements.js';
import { PDF_INDEX_STATE_SCHEMA_STATEMENTS } from './pdfIndexStateSchema.js';
import { isRetiredAttachmentSchema } from './retiredAttachmentSchema.js';
import { SYNC_DELIVERY_TRIGGER_STATEMENTS } from './syncDeliveryTriggerStatements.js';
import { SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS } from './syncGroupRestoreSchemaStatements.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from './syncGroupSchemaStatements.js';
import { SYNC_PACK_DEPENDENCY_STAGING_SCHEMA } from './syncPackDependencyStagingSchema.js';
import { SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS } from './syncPackProgressSchemaStatements.js';

export const COMPANION_SCHEMA_STATEMENTS = [
  ...ANDROID_COMPANION_HOST_SCHEMA_STATEMENTS,
  ...ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS,
  ...ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS,
  ...PDF_INDEX_STATE_SCHEMA_STATEMENTS,
  ...ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS,
  ...SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS,
  ...SYNC_PACK_DEPENDENCY_STAGING_SCHEMA,
  ...SYNC_GROUP_SCHEMA_STATEMENTS,
  ...SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS,
  ...NODE_VERSION_RETENTION_SCHEMA_STATEMENTS,
  ...SYNC_DELIVERY_TRIGGER_STATEMENTS
].filter((statement) => !isRetiredAttachmentSchema(statement));
