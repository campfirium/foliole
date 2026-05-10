import { DESKTOP_CORE_SCHEMA_STATEMENTS } from './desktopCoreSchemaStatements.js';
import { DESKTOP_RESOURCE_SCHEMA_STATEMENTS } from './desktopResourceSchemaStatements.js';
import { EXTERNAL_DOCUMENT_SCHEMA_STATEMENTS } from './externalDocumentSchemaStatements.js';
import { KEEP_IMPORT_SCHEMA_STATEMENTS } from './keepImportSchemaStatements.js';
import { READWISE_SOURCE_SCHEMA_STATEMENTS } from './readwiseSourceSchemaStatements.js';
import { SYNC_SCHEMA_STATEMENTS } from './syncSchemaStatements.js';

export const DESKTOP_FRESH_SCHEMA_STATEMENTS = [
  ...DESKTOP_CORE_SCHEMA_STATEMENTS,
  ...DESKTOP_RESOURCE_SCHEMA_STATEMENTS,
  ...KEEP_IMPORT_SCHEMA_STATEMENTS,
  ...SYNC_SCHEMA_STATEMENTS,
  ...EXTERNAL_DOCUMENT_SCHEMA_STATEMENTS,
  ...READWISE_SOURCE_SCHEMA_STATEMENTS
];
