import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { expect, it } from 'vitest';

const ROOT = process.cwd();
const SCANNED_DIRS = ['src/companion', 'src/shared/platform', 'lib/platform'];
const SQLITE_TOUCH_ALLOWED = new Set([
  'src/shared/platform/capacitorSqliteDbPort.ts',
  'src/shared/platform/companionSyncReviewLogApply.ts',
  'src/shared/platform/companionSyncStateObjects.ts',
  'src/shared/platform/companionSyncNodeVersions.ts',
  'src/shared/platform/companionSyncPackNodes.ts',
  'src/shared/platform/companion/runtime/iosCompanionDatabaseBootstrap.ts',
  'src/shared/platform/companion/sync/cursor/iosCompanionSyncPackCursorStore.ts',
  'src/shared/platform/companion/sync/pack-apply/iosCompanionSyncPackApply.ts'
]);
const SQL_METHOD_PATTERN = /\b(?:executeSql|querySql|runSql|sqlExecute|sqlQuery)\b/i;

function listSourceFiles(dir: string): string[] {
  const absoluteDir = join(ROOT, dir);
  return readdirSync(absoluteDir).flatMap((entry) => {
    const absolutePath = join(absoluteDir, entry);
    const path = relative(ROOT, absolutePath).replaceAll('\\', '/');
    if (statSync(absolutePath).isDirectory()) return listSourceFiles(path);
    if (!path.endsWith('.ts') || path.endsWith('.test.ts')) return [];
    return [path];
  });
}

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8');
}

it('keeps companion SQLite access behind trusted native adapters', () => {
  const violations = SCANNED_DIRS.flatMap(listSourceFiles).filter((path) => {
    if (SQLITE_TOUCH_ALLOWED.has(path)) return false;
    const source = readSource(path);
    return source.includes('@capacitor-community/sqlite') ||
      source.includes('createCapacitorSqliteDbPort') ||
      source.includes('SQLiteConnection') ||
      source.includes('CapacitorSQLite');
  });

  expect(violations).toEqual([]);
});

it('does not expose generic SQL commands through platform contracts', () => {
  const violations = SCANNED_DIRS.flatMap(listSourceFiles).filter((path) => SQL_METHOD_PATTERN.test(readSource(path)));

  expect(violations).toEqual([]);
});
