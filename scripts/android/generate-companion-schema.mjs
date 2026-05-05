/* global console */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionCoreSchemaStatements.ts';
import { ANDROID_COMPANION_HOST_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionHostSchemaStatements.ts';
import { ANDROID_COMPANION_MIGRATION_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionMigrationSchemaStatements.ts';
import { ANDROID_COMPANION_MUTATION_DEFINITIONS } from '../../lib/core/database/androidCompanionMutationDefinitions.ts';
import { ANDROID_COMPANION_QUERY_DEFINITIONS } from '../../lib/core/database/androidCompanionQueryDefinitions.ts';
import { ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionResourceSchemaStatements.ts';
import { ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionSyncSchemaStatements.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const outputPath = path.join(repoRoot, 'android/app/src/main/assets/companion-core-schema.json');
const migrationOutputPath = path.join(repoRoot, 'android/app/src/main/assets/companion-migration-schema.json');
const mutationOutputPath = path.join(repoRoot, 'android/app/src/main/assets/companion-mutation-definitions.json');
const queryOutputPath = path.join(repoRoot, 'android/app/src/main/assets/companion-query-definitions.json');
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
  `${JSON.stringify({ statementsByName: ANDROID_COMPANION_MIGRATION_SCHEMA_STATEMENTS }, null, 2)}\n`,
  'utf8'
);
await fs.writeFile(mutationOutputPath, `${JSON.stringify({ statements: ANDROID_COMPANION_MUTATION_DEFINITIONS }, null, 2)}\n`, 'utf8');
await fs.writeFile(queryOutputPath, `${JSON.stringify({ queries: ANDROID_COMPANION_QUERY_DEFINITIONS }, null, 2)}\n`, 'utf8');
console.info('[android-schema] wrote companion schema artifact', outputPath);
console.info('[android-schema] wrote companion migration schema artifact', migrationOutputPath);
console.info('[android-schema] wrote companion mutation definitions artifact', mutationOutputPath);
console.info('[android-schema] wrote companion query definitions artifact', queryOutputPath);
