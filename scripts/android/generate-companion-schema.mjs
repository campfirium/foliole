/* global console */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionCoreSchemaStatements.ts';
import { ANDROID_COMPANION_HOST_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionHostSchemaStatements.ts';
import {
  ANDROID_COMPANION_MIGRATION_PLAN,
  ANDROID_COMPANION_MIGRATION_REPAIR_RULES,
  ANDROID_COMPANION_MIGRATION_SCHEMA_STATEMENTS
} from '../../lib/core/database/androidCompanionMigrationSchemaStatements.ts';
import { ANDROID_COMPANION_DIAGNOSTIC_READ_RULES } from '../../lib/core/database/androidCompanionDiagnosticQueryDefinitions.ts';
import {
  ANDROID_COMPANION_APP_DATA_CLEAR_MUTATIONS,
  ANDROID_COMPANION_HOST_SUPPORT_MUTATION_RULES,
  ANDROID_COMPANION_MUTATION_DEFINITIONS,
  ANDROID_COMPANION_RESOURCE_MUTATION_RULES,
  ANDROID_COMPANION_SYNC_APPLY_MUTATION_RULES
} from '../../lib/core/database/androidCompanionMutationDefinitions.ts';
import { ANDROID_COMPANION_QUERY_DEFINITIONS } from '../../lib/core/database/androidCompanionQueryDefinitions.ts';
import { ANDROID_COMPANION_SYNC_PAYLOAD_ROUTING } from '../../lib/core/database/androidCompanionPayloadQueryDefinitions.ts';
import {
  ANDROID_COMPANION_CONTENT_READ_RULES,
  ANDROID_COMPANION_MISSING_RESOURCE_READ_RULES,
  ANDROID_COMPANION_NODE_ATTACHMENT_READ_RULES,
  ANDROID_COMPANION_RESOURCE_READ_RULES,
  ANDROID_COMPANION_WORKSPACE_READ_RULES
} from '../../lib/core/database/androidCompanionResourceQueryDefinitions.ts';
import { ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionResourceSchemaStatements.ts';
import { ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionSyncSchemaStatements.ts';
import {
  ANDROID_COMPANION_RUNTIME_QUERY_RULES,
  ANDROID_COMPANION_SYNC_CONFLICT_READ_RULES,
  ANDROID_COMPANION_SYNC_OBJECT_READ_RULES,
  ANDROID_COMPANION_SYNC_STREAM_READ_RULES
} from '../../lib/core/database/androidCompanionSyncQueryDefinitions.ts';
import { ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS } from '../../lib/core/database/androidCompanionSyncProtocolDefinitions.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const outputPath = path.join(repoRoot, 'android/app/src/main/assets/companion-core-schema.json');
const migrationOutputPath = path.join(repoRoot, 'android/app/src/main/assets/companion-migration-schema.json');
const mutationOutputPath = path.join(repoRoot, 'android/app/src/main/assets/companion-mutation-definitions.json');
const queryOutputPath = path.join(repoRoot, 'android/app/src/main/assets/companion-query-definitions.json');
const syncProtocolOutputPath = path.join(repoRoot, 'android/app/src/main/assets/companion-sync-protocol-definitions.json');
const statements = [
  ...ANDROID_COMPANION_HOST_SCHEMA_STATEMENTS,
  ...ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS,
  ...ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS,
  ...ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS
];

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify({ statements }, null, 2)}\n`, 'utf8');
await fs.writeFile(
  migrationOutputPath,
  `${JSON.stringify({
    plan: ANDROID_COMPANION_MIGRATION_PLAN,
    repairRules: ANDROID_COMPANION_MIGRATION_REPAIR_RULES,
    statementsByName: ANDROID_COMPANION_MIGRATION_SCHEMA_STATEMENTS
  }, null, 2)}\n`,
  'utf8'
);
await fs.writeFile(
  mutationOutputPath,
  `${JSON.stringify({
    appDataClearMutations: ANDROID_COMPANION_APP_DATA_CLEAR_MUTATIONS,
    hostSupportMutations: ANDROID_COMPANION_HOST_SUPPORT_MUTATION_RULES,
    resourceMutations: ANDROID_COMPANION_RESOURCE_MUTATION_RULES,
    statements: ANDROID_COMPANION_MUTATION_DEFINITIONS,
    syncApplyMutations: ANDROID_COMPANION_SYNC_APPLY_MUTATION_RULES
  }, null, 2)}\n`,
  'utf8'
);
await fs.writeFile(
  queryOutputPath,
  `${JSON.stringify({
    queries: ANDROID_COMPANION_QUERY_DEFINITIONS,
    contentRead: ANDROID_COMPANION_CONTENT_READ_RULES,
    diagnosticRead: ANDROID_COMPANION_DIAGNOSTIC_READ_RULES,
    missingResourceRead: ANDROID_COMPANION_MISSING_RESOURCE_READ_RULES,
    nodeAttachmentRead: ANDROID_COMPANION_NODE_ATTACHMENT_READ_RULES,
    resourceRead: ANDROID_COMPANION_RESOURCE_READ_RULES,
    runtimeQueries: ANDROID_COMPANION_RUNTIME_QUERY_RULES,
    syncConflictRead: ANDROID_COMPANION_SYNC_CONFLICT_READ_RULES,
    syncObjectRead: ANDROID_COMPANION_SYNC_OBJECT_READ_RULES,
    syncStreamRead: ANDROID_COMPANION_SYNC_STREAM_READ_RULES,
    syncPayloadRouting: {
      ...ANDROID_COMPANION_SYNC_PAYLOAD_ROUTING,
      routes: syncPayloadRoutes(ANDROID_COMPANION_QUERY_DEFINITIONS)
    },
    workspaceRead: ANDROID_COMPANION_WORKSPACE_READ_RULES
  }, null, 2)}\n`,
  'utf8'
);
await fs.writeFile(syncProtocolOutputPath, `${JSON.stringify(ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS, null, 2)}\n`, 'utf8');
console.info('[android-schema] wrote companion schema artifact', outputPath);
console.info('[android-schema] wrote companion migration schema artifact', migrationOutputPath);
console.info('[android-schema] wrote companion mutation definitions artifact', mutationOutputPath);
console.info('[android-schema] wrote companion query definitions artifact', queryOutputPath);
console.info('[android-schema] wrote companion sync protocol definitions artifact', syncProtocolOutputPath);

function syncPayloadRoutes(queries) {
  return Object.entries(queries)
    .filter(([, query]) => query.syncPayload)
    .map(([queryName, query]) => ({
      argMode: query.syncPayload.argMode ?? 'object_id',
      objectIdKey: query.syncPayload.objectIdKey,
      objectIdPrefix: query.syncPayload.objectIdPrefix,
      objectType: query.syncPayload.objectType,
      queryName
    }));
}
