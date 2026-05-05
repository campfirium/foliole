import { ANDROID_COMPANION_DIAGNOSTIC_QUERY_DEFINITIONS } from './androidCompanionDiagnosticQueryDefinitions.ts';
import { ANDROID_COMPANION_MIGRATION_QUERY_DEFINITIONS } from './androidCompanionMigrationQueryDefinitions.ts';
import { ANDROID_COMPANION_PAYLOAD_QUERY_DEFINITIONS } from './androidCompanionPayloadQueryDefinitions.ts';
import { ANDROID_COMPANION_RESOURCE_QUERY_DEFINITIONS } from './androidCompanionResourceQueryDefinitions.ts';
import { ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS } from './androidCompanionSyncQueryDefinitions.ts';

export const ANDROID_COMPANION_QUERY_DEFINITIONS = {
  ...ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS,
  ...ANDROID_COMPANION_RESOURCE_QUERY_DEFINITIONS,
  ...ANDROID_COMPANION_PAYLOAD_QUERY_DEFINITIONS,
  ...ANDROID_COMPANION_DIAGNOSTIC_QUERY_DEFINITIONS,
  ...ANDROID_COMPANION_MIGRATION_QUERY_DEFINITIONS
};

export const ANDROID_COMPANION_QUERY_ASSET_KEYS = {
  contentRead: 'contentRead',
  diagnosticRead: 'diagnosticRead',
  missingResourceRead: 'missingResourceRead',
  nodeAttachmentRead: 'nodeAttachmentRead',
  queryShape: 'queryShape',
  queries: 'queries',
  resourceRead: 'resourceRead',
  runtimeQueries: 'runtimeQueries',
  syncConflictRead: 'syncConflictRead',
  syncObjectRead: 'syncObjectRead',
  syncStreamRead: 'syncStreamRead',
  syncPayloadRouting: 'syncPayloadRouting',
  workspaceRead: 'workspaceRead'
} as const;

export const ANDROID_COMPANION_QUERY_SHAPE_KEYS = {
  column: {
    key: 'key',
    source: 'source',
    type: 'type'
  },
  columnTypes: {
    double: 'double',
    json: 'json',
    long: 'long'
  },
  field: {
    defaultRuleKey: 'defaultRuleKey',
    defaultValue: 'defaultValue',
    omitWhenNull: 'omitWhenNull',
    outputKey: 'outputKey',
    rowKey: 'rowKey',
    type: 'type'
  },
  fieldCollections: {
    deletedAtField: 'deletedAtField',
    fields: 'fields',
    requiredRowKeys: 'requiredRowKeys',
    validStates: 'validStates'
  },
  fieldTypes: {
    booleanLong: 'booleanLong',
    contentStatus: 'contentStatus',
    defaultedString: 'defaultedString',
    double: 'double',
    json: 'json',
    kind: 'kind',
    long: 'long',
    nonNegativeLong: 'nonNegativeLong',
    nullableNonNegativeLong: 'nullableNonNegativeLong',
    nullableString: 'nullableString',
    resolvedContent: 'resolvedContent',
    string: 'string',
    title: 'title'
  },
  query: {
    columns: 'columns',
    resultKey: 'resultKey',
    sql: 'sql',
    syncPayload: 'syncPayload'
  },
  routing: {
    routes: 'routes'
  }
} as const;
