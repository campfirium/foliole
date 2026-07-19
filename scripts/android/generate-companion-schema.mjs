/* global console */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeCompanionContractAssets } from '../capacitor/write-companion-contract-assets.mjs';
import { ANDROID_COMPANION_BRIDGE_CONTRACT_DEFINITIONS } from '../../lib/core/database/androidCompanionBridgeContractDefinitions.ts';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.ts';
import {
  ANDROID_COMPANION_MIGRATION_ACTION_TYPES,
  ANDROID_COMPANION_MIGRATION_ACTION_KEYS,
  ANDROID_COMPANION_MIGRATION_ASSET_KEYS,
  ANDROID_COMPANION_MIGRATION_DEFAULT_MESSAGES,
  ANDROID_COMPANION_MIGRATION_PLAN,
  ANDROID_COMPANION_MIGRATION_PLAN_KEYS,
  ANDROID_COMPANION_MIGRATION_REPAIR_RULE_KEYS,
  ANDROID_COMPANION_MIGRATION_REPAIR_RULES,
  ANDROID_COMPANION_MIGRATION_SCHEMA_STATEMENTS
} from '../../lib/core/database/androidCompanionMigrationSchemaStatements.ts';
import { ANDROID_COMPANION_DIAGNOSTIC_READ_RULES } from '../../lib/core/database/androidCompanionDiagnosticQueryDefinitions.ts';
import {
  ANDROID_COMPANION_APP_DATA_CLEAR_MUTATIONS,
  ANDROID_COMPANION_HOST_SUPPORT_MUTATION_RULES,
  ANDROID_COMPANION_MUTATION_ASSET_KEYS,
  ANDROID_COMPANION_MUTATION_DEFINITIONS,
  ANDROID_COMPANION_MUTATION_SHAPE_KEYS,
  ANDROID_COMPANION_RESOURCE_MUTATION_RULES,
  ANDROID_COMPANION_RUNTIME_MUTATION_RULES,
  ANDROID_COMPANION_SYNC_APPLY_MUTATION_RULES
} from '../../lib/core/database/androidCompanionMutationDefinitions.ts';
import {
  ANDROID_COMPANION_QUERY_ASSET_KEYS,
  ANDROID_COMPANION_QUERY_DEFINITIONS,
  ANDROID_COMPANION_QUERY_SHAPE_KEYS
} from '../../lib/core/database/androidCompanionQueryDefinitions.ts';
import { buildAndroidQueryShapeJava } from './android-query-shape-java.mjs';
import { buildAndroidResourceQueryStringJava } from './android-resource-query-string-java.mjs';
import { ANDROID_COMPANION_SYNC_PAYLOAD_ROUTING } from '../../lib/core/database/androidCompanionPayloadQueryDefinitions.ts';
import {
  ANDROID_COMPANION_CONTENT_READ_RULES,
  ANDROID_COMPANION_MISSING_RESOURCE_READ_RULES,
  ANDROID_COMPANION_NODE_ATTACHMENT_READ_RULES,
  ANDROID_COMPANION_RESOURCE_READ_RULES,
  ANDROID_COMPANION_WORKSPACE_READ_RULES
} from '../../lib/core/database/androidCompanionResourceQueryDefinitions.ts';
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
const queryShapeJavaOutputPath = path.join(
  repoRoot,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionQueryDefinitionShapeKeys.java'
);
const resourceQueryStringJavaOutputPath = path.join(
  repoRoot,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionResourceQueryStringKeys.java'
);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify({ statements: COMPANION_SCHEMA_STATEMENTS }, null, 2)}\n`, 'utf8');
await fs.writeFile(
  migrationOutputPath,
  `${JSON.stringify({
    actionKeys: ANDROID_COMPANION_MIGRATION_ACTION_KEYS,
    actionTypes: ANDROID_COMPANION_MIGRATION_ACTION_TYPES,
    assetKeys: ANDROID_COMPANION_MIGRATION_ASSET_KEYS,
    defaultMessages: ANDROID_COMPANION_MIGRATION_DEFAULT_MESSAGES,
    plan: ANDROID_COMPANION_MIGRATION_PLAN,
    planKeys: ANDROID_COMPANION_MIGRATION_PLAN_KEYS,
    repairRuleKeys: ANDROID_COMPANION_MIGRATION_REPAIR_RULE_KEYS,
    repairRules: ANDROID_COMPANION_MIGRATION_REPAIR_RULES,
    statementsByName: ANDROID_COMPANION_MIGRATION_SCHEMA_STATEMENTS
  }, null, 2)}\n`,
  'utf8'
);
await fs.writeFile(
  mutationOutputPath,
  `${JSON.stringify({
    appDataClearMutations: ANDROID_COMPANION_APP_DATA_CLEAR_MUTATIONS,
    assetKeys: ANDROID_COMPANION_MUTATION_ASSET_KEYS,
    hostSupportMutations: ANDROID_COMPANION_HOST_SUPPORT_MUTATION_RULES,
    mutationShape: ANDROID_COMPANION_MUTATION_SHAPE_KEYS,
    resourceMutations: ANDROID_COMPANION_RESOURCE_MUTATION_RULES,
    runtimeMutations: ANDROID_COMPANION_RUNTIME_MUTATION_RULES,
    statements: ANDROID_COMPANION_MUTATION_DEFINITIONS,
    syncApplyMutations: ANDROID_COMPANION_SYNC_APPLY_MUTATION_RULES
  }, null, 2)}\n`,
  'utf8'
);
await fs.writeFile(
  queryOutputPath,
  `${JSON.stringify({
    queries: ANDROID_COMPANION_QUERY_DEFINITIONS,
    assetKeys: ANDROID_COMPANION_QUERY_ASSET_KEYS,
    contentRead: ANDROID_COMPANION_CONTENT_READ_RULES,
    diagnosticRead: ANDROID_COMPANION_DIAGNOSTIC_READ_RULES,
    missingResourceRead: ANDROID_COMPANION_MISSING_RESOURCE_READ_RULES,
    nodeAttachmentRead: ANDROID_COMPANION_NODE_ATTACHMENT_READ_RULES,
    queryShape: ANDROID_COMPANION_QUERY_SHAPE_KEYS,
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
await writeCompanionContractAssets({
  bridgeDefinitions: ANDROID_COMPANION_BRIDGE_CONTRACT_DEFINITIONS,
  repoRoot,
  syncDefinitions: ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS
});
await fs.writeFile(
  queryShapeJavaOutputPath,
  buildAndroidQueryShapeJava(ANDROID_COMPANION_QUERY_ASSET_KEYS, ANDROID_COMPANION_QUERY_SHAPE_KEYS),
  'utf8'
);
await fs.writeFile(
  resourceQueryStringJavaOutputPath,
  buildAndroidResourceQueryStringJava({
    contentRead: ANDROID_COMPANION_CONTENT_READ_RULES,
    missingResourceRead: ANDROID_COMPANION_MISSING_RESOURCE_READ_RULES,
    resourceRead: ANDROID_COMPANION_RESOURCE_READ_RULES,
    workspaceRead: ANDROID_COMPANION_WORKSPACE_READ_RULES
  }),
  'utf8'
);
console.info('[android-schema] wrote companion schema artifact', outputPath);
console.info('[android-schema] wrote companion migration schema artifact', migrationOutputPath);
console.info('[android-schema] wrote companion mutation definitions artifact', mutationOutputPath);
console.info('[android-schema] wrote companion query definitions artifact', queryOutputPath);
console.info('[android-schema] wrote cross-host companion contract artifacts');
console.info('[android-schema] wrote companion query descriptor artifact', queryShapeJavaOutputPath);
console.info('[android-schema] wrote companion resource query descriptor artifact', resourceQueryStringJavaOutputPath);

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
