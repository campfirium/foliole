import { PDF_TEXT_ARTIFACT_SCHEMA } from '../sync/pdfTextArtifact.js';

import { ATTACHMENT_DEMAND_SCHEMA } from './attachmentDemandSchema.js';
import { CURRENT_PARENT_ORDER_SCHEMA } from './currentParentOrderSchema.js';
import { DATA_MIGRATION_STATE_SCHEMA_STATEMENTS } from './dataMigrationState.js';
import { DESKTOP_CORE_SCHEMA_STATEMENTS } from './desktopCoreSchemaStatements.js';
import { DESKTOP_RESOURCE_SCHEMA_STATEMENTS } from './desktopResourceSchemaStatements.js';
import { WATCHED_FOLDER_BINDING_SCHEMA_STATEMENTS } from './desktopSourceConnectionSchemaStatements.js';
import { DESKTOP_SOURCE_SCHEMA_STATEMENTS } from './desktopSourceSchemaStatements.js';
import { EXTERNAL_DOCUMENT_SCHEMA_STATEMENTS } from './externalDocumentSchemaStatements.js';
import { FOREGROUND_TIME_SCHEMA } from './foregroundTimeSchema.js';
import { FRAMED_SYNC_DIGEST_SCHEMA } from './framedSyncDigestSchema.js';
import { FRAMED_SYNC_INVENTORY_SCHEMA } from './framedSyncInventorySchema.js';
import { KEEP_IMPORT_SCHEMA_STATEMENTS } from './keepImportSchemaStatements.js';
import { LEGACY_BODY_MIGRATION_SCHEMA } from './legacyBodyMigrationSchema.js';
import { isLegacyOrderingSchema } from './legacyStorageRetirementMigration.js';
import { LOCAL_FILE_SCHEMA_STATEMENTS } from './localFileSchemaStatements.js';
import { NODE_VERSION_RETENTION_INDEX_SCHEMA } from './nodeVersionRetentionIndexSchema.js';
import { NODE_VERSION_RETENTION_SCHEMA_STATEMENTS } from './nodeVersionRetentionSchemaStatements.js';
import { WATCHED_FOLDER_CONFLICT_SCHEMA_STATEMENTS } from './numberedMigrationWatchedFolderConflicts.js';
import { PDF_INDEX_STATE_SCHEMA_STATEMENTS } from './pdfIndexStateSchema.js';
import { READWISE_HOST_SETTINGS_VERSION_GUARDS } from './readwiseHostSettingsVersionMigration.js';
import { isRetiredAttachmentSchema } from './retiredAttachmentSchema.js';
import { isRetiredSyncSchema } from './retiredSyncSchema.js';
import { REVIEW_DAILY_COUNT_SCHEMA } from './reviewDailyCountSchema.js';
import { SEARCH_INDEX_INVALIDATION_SCHEMA_STATEMENTS } from './searchIndexInvalidationSchemaStatements.js';
import { SOURCE_DISPOSITION_SCHEMA_STATEMENTS } from './sourceDispositionSchemaStatements.js';
import { STORED_SOURCE_SEARCH_SCHEMA } from './storedSourceSearchSchema.js';
import { SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS } from './syncGroupRestoreSchemaStatements.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from './syncGroupSchemaStatements.js';
import { SYNC_SCHEMA_STATEMENTS } from './syncSchemaStatements.js';

export const DESKTOP_FRESH_SCHEMA_STATEMENTS = [
  ...DESKTOP_CORE_SCHEMA_STATEMENTS,
  ...NODE_VERSION_RETENTION_INDEX_SCHEMA,
  ...REVIEW_DAILY_COUNT_SCHEMA,
  ...FOREGROUND_TIME_SCHEMA,
  ...DESKTOP_RESOURCE_SCHEMA_STATEMENTS.slice(0, 6),
  ...KEEP_IMPORT_SCHEMA_STATEMENTS,
  ...DESKTOP_RESOURCE_SCHEMA_STATEMENTS.slice(6),
  ...PDF_INDEX_STATE_SCHEMA_STATEMENTS,
  PDF_TEXT_ARTIFACT_SCHEMA,
  ...WATCHED_FOLDER_BINDING_SCHEMA_STATEMENTS,
  ...WATCHED_FOLDER_CONFLICT_SCHEMA_STATEMENTS,
  ...DESKTOP_SOURCE_SCHEMA_STATEMENTS,
  ...SYNC_SCHEMA_STATEMENTS,

  ...SYNC_GROUP_SCHEMA_STATEMENTS,
  ...SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS,
  ...NODE_VERSION_RETENTION_SCHEMA_STATEMENTS,
  ...CURRENT_PARENT_ORDER_SCHEMA,
  ...ATTACHMENT_DEMAND_SCHEMA,

  ...EXTERNAL_DOCUMENT_SCHEMA_STATEMENTS,
  ...LOCAL_FILE_SCHEMA_STATEMENTS,
  ...SOURCE_DISPOSITION_SCHEMA_STATEMENTS,
  ...SEARCH_INDEX_INVALIDATION_SCHEMA_STATEMENTS,
  ...READWISE_HOST_SETTINGS_VERSION_GUARDS,
  ...STORED_SOURCE_SEARCH_SCHEMA,
  ...LEGACY_BODY_MIGRATION_SCHEMA,
  ...DATA_MIGRATION_STATE_SCHEMA_STATEMENTS,

  ...FRAMED_SYNC_INVENTORY_SCHEMA,
  ...FRAMED_SYNC_DIGEST_SCHEMA
].filter((statement) => !isRetiredAttachmentSchema(statement) && !isLegacyOrderingSchema(statement) && !isRetiredSyncSchema(statement));
