// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION_SCHEMA = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-migration-schema.json');
const DATABASE_MIGRATION = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionDatabaseMigration.java'
);
const SCHEMA_INSTALLER = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSchemaInstaller.java'
);

describe('Android migration plan metadata', () => {
  it('generates versioned migration actions in the migration schema asset', async () => {
    const schema = JSON.parse(await readFile(MIGRATION_SCHEMA, 'utf8'));

    expect(schema.plan.map((step) => step.beforeVersion)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(schema.plan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actions: expect.arrayContaining([
            expect.objectContaining({ type: 'migrateSyncObjectStateSequence' }),
            expect.objectContaining({ type: 'installSchema' })
          ]),
          beforeVersion: 5
        }),
        expect.objectContaining({
          actions: [expect.objectContaining({ type: 'backfillNodeAttachmentsFromVersions' })],
          beforeVersion: 9
        }),
        expect.objectContaining({
          actions: expect.arrayContaining([
            expect.objectContaining({ type: 'installSchema' }),
            expect.objectContaining({ type: 'addSyncBaseContentHashIfMissing' })
          ]),
          beforeVersion: 13
        })
      ])
    );
  });

  it('keeps Android Java migration version orchestration driven by the generated plan', async () => {
    const migrationSource = await readFile(DATABASE_MIGRATION, 'utf8');
    const installerSource = await readFile(SCHEMA_INSTALLER, 'utf8');

    expect(installerSource).toContain('static JSONArray migrationPlan(Context context)');
    expect(migrationSource).toContain('FolioleCompanionSchemaInstaller.migrationPlan(context)');
    expect(migrationSource).toContain('oldVersion < step.getInt("beforeVersion")');
    expect(migrationSource).not.toContain('oldVersion < 4');
    expect(migrationSource).not.toContain('oldVersion < 14');
    expect(migrationSource).not.toContain('Failed to upgrade companion push ack schema.');
  });
});
