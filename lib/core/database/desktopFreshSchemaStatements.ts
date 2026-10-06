import { PARENT_ORDER_VERSION_SCHEMA } from '../sync/syncParentOrderVersionStore.js';

import { DATA_MIGRATION_STATE_SCHEMA_STATEMENTS } from './dataMigrationState.js';
import { DESKTOP_CORE_SCHEMA_STATEMENTS } from './desktopCoreSchemaStatements.js';
import { DESKTOP_RESOURCE_SCHEMA_STATEMENTS } from './desktopResourceSchemaStatements.js';
import { WATCHED_FOLDER_BINDING_SCHEMA_STATEMENTS } from './desktopSourceConnectionSchemaStatements.js';
import { DESKTOP_SOURCE_SCHEMA_STATEMENTS } from './desktopSourceSchemaStatements.js';
import { EXTERNAL_DOCUMENT_SCHEMA_STATEMENTS } from './externalDocumentSchemaStatements.js';
import { FOREGROUND_TIME_SCHEMA } from './foregroundTimeSchema.js';
import { FRAMED_SYNC_INVENTORY_SCHEMA } from './framedSyncInventorySchema.js';
import { FRAMED_SYNC_STAGING_SCHEMA } from './framedSyncStagingSchema.js';
import { KEEP_IMPORT_SCHEMA_STATEMENTS } from './keepImportSchemaStatements.js';
import { LEGACY_BODY_MIGRATION_SCHEMA } from './legacyBodyMigrationSchema.js';
import { isLegacyOrderingSchema } from './legacyStorageRetirementMigration.js';
import { LOCAL_FILE_SCHEMA_STATEMENTS } from './localFileSchemaStatements.js';
import { NODE_VERSION_MEMBER_POSITION_SCHEMA } from './nodeVersionMemberPositionSchema.js';
import { NODE_VERSION_RETENTION_INDEX_SCHEMA } from './nodeVersionRetentionIndexSchema.js';
import { NODE_VERSION_RETENTION_SCHEMA_STATEMENTS } from './nodeVersionRetentionSchemaStatements.js';
import { WATCHED_FOLDER_CONFLICT_SCHEMA_STATEMENTS } from './numberedMigrationWatchedFolderConflicts.js';
import { PDF_INDEX_STATE_SCHEMA_STATEMENTS } from './pdfIndexStateSchema.js';
import { READWISE_HOST_SETTINGS_VERSION_GUARDS } from './readwiseHostSettingsVersionMigration.js';
import { isRetiredAttachmentSchema } from './retiredAttachmentSchema.js';
import { REVIEW_DAILY_COUNT_SCHEMA } from './reviewDailyCountSchema.js';
import { SEARCH_INDEX_INVALIDATION_SCHEMA_STATEMENTS } from './searchIndexInvalidationSchemaStatements.js';
import { SOURCE_DISPOSITION_SCHEMA_STATEMENTS } from './sourceDispositionSchemaStatements.js';
import { STORED_SOURCE_SEARCH_SCHEMA } from './storedSourceSearchSchema.js';
import { SYNC_DELIVERY_TRIGGER_STATEMENTS } from './syncDeliveryTriggerStatements.js';
import { SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS } from './syncGroupRestoreSchemaStatements.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from './syncGroupSchemaStatements.js';
import { SYNC_IDENTITY_ENTITY_TRIGGER_STATEMENTS } from './syncIdentityEntityTriggerStatements.js';
import { SYNC_IDENTITY_FACT_STAGING_SCHEMA } from './syncIdentityFactStagingSchema.js';
import { SYNC_IDENTITY_INDEX_SCHEMA_STATEMENTS } from './syncIdentityIndexSchemaStatements.js';
import { SYNC_IDENTITY_RECEIPT_SCHEMA_STATEMENTS } from './syncIdentityReceiptSchemaStatements.js';
import { SYNC_PACK_DEPENDENCY_STAGING_SCHEMA } from './syncPackDependencyStagingSchema.js';
import { SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS } from './syncPackProgressSchemaStatements.js';
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
  ...WATCHED_FOLDER_BINDING_SCHEMA_STATEMENTS,
  ...WATCHED_FOLDER_CONFLICT_SCHEMA_STATEMENTS,
  ...DESKTOP_SOURCE_SCHEMA_STATEMENTS,
  ...SYNC_SCHEMA_STATEMENTS,
  ...SYNC_IDENTITY_INDEX_SCHEMA_STATEMENTS,
  ...SYNC_IDENTITY_FACT_STAGING_SCHEMA,
  ...SYNC_IDENTITY_RECEIPT_SCHEMA_STATEMENTS,
  ...SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS,
  ...SYNC_PACK_DEPENDENCY_STAGING_SCHEMA,
  ...FRAMED_SYNC_STAGING_SCHEMA,
  ...SYNC_GROUP_SCHEMA_STATEMENTS,
  ...SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS,
  ...NODE_VERSION_RETENTION_SCHEMA_STATEMENTS,
  ...NODE_VERSION_MEMBER_POSITION_SCHEMA,
  ...PARENT_ORDER_VERSION_SCHEMA,
  ...SYNC_DELIVERY_TRIGGER_STATEMENTS,
  ...EXTERNAL_DOCUMENT_SCHEMA_STATEMENTS,
  ...LOCAL_FILE_SCHEMA_STATEMENTS,
  ...SOURCE_DISPOSITION_SCHEMA_STATEMENTS,
  ...SEARCH_INDEX_INVALIDATION_SCHEMA_STATEMENTS,
  ...READWISE_HOST_SETTINGS_VERSION_GUARDS,
  ...STORED_SOURCE_SEARCH_SCHEMA,
  ...LEGACY_BODY_MIGRATION_SCHEMA,
  ...DATA_MIGRATION_STATE_SCHEMA_STATEMENTS,
  ...SYNC_IDENTITY_ENTITY_TRIGGER_STATEMENTS,
  ...FRAMED_SYNC_INVENTORY_SCHEMA
].filter((statement) => !isRetiredAttachmentSchema(statement) && !isLegacyOrderingSchema(statement));
