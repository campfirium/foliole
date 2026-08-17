import { DESKTOP_CORE_SCHEMA_STATEMENTS } from './desktopCoreSchemaStatements.js';
import { DESKTOP_RESOURCE_SCHEMA_STATEMENTS } from './desktopResourceSchemaStatements.js';
import { EXTERNAL_DOCUMENT_SCHEMA_STATEMENTS } from './externalDocumentSchemaStatements.js';
import { KEEP_IMPORT_SCHEMA_STATEMENTS } from './keepImportSchemaStatements.js';
import { LOCAL_FILE_SCHEMA_STATEMENTS } from './localFileSchemaStatements.js';
import { SEARCH_INDEX_INVALIDATION_SCHEMA_STATEMENTS } from './searchIndexInvalidationSchemaStatements.js';
import { SOURCE_DISPOSITION_SCHEMA_STATEMENTS } from './sourceDispositionSchemaStatements.js';
import { SOURCE_OWNERSHIP_SCHEMA_STATEMENTS } from './sourceOwnershipSchemaStatements.js';
import { SYNC_DELIVERY_TRIGGER_STATEMENTS } from './syncDeliveryTriggerStatements.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from './syncGroupSchemaStatements.js';
import { SYNC_SCHEMA_STATEMENTS } from './syncSchemaStatements.js';

export const DESKTOP_FRESH_SCHEMA_STATEMENTS = [
  ...DESKTOP_CORE_SCHEMA_STATEMENTS,
  ...DESKTOP_RESOURCE_SCHEMA_STATEMENTS.slice(0, 6),
  ...KEEP_IMPORT_SCHEMA_STATEMENTS,
  ...DESKTOP_RESOURCE_SCHEMA_STATEMENTS.slice(6),
  ...SYNC_SCHEMA_STATEMENTS,
  ...SYNC_GROUP_SCHEMA_STATEMENTS,
  ...SYNC_DELIVERY_TRIGGER_STATEMENTS,
  ...EXTERNAL_DOCUMENT_SCHEMA_STATEMENTS,
  ...LOCAL_FILE_SCHEMA_STATEMENTS,
  ...SOURCE_DISPOSITION_SCHEMA_STATEMENTS,
  ...SOURCE_OWNERSHIP_SCHEMA_STATEMENTS,
  ...SEARCH_INDEX_INVALIDATION_SCHEMA_STATEMENTS
];
