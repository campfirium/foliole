// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_SYNC_CONFLICT_READ_RULES } from '../../lib/core/database/androidCompanionSyncQueryDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const DATABASE_HELPER = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionDatabaseHelper.java');
const CONFLICT_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncConflictQueryRules.java');

describe('Android sync conflict query rules', () => {
  it('generates node conflict read metadata', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.syncConflictRead).toEqual(ANDROID_COMPANION_SYNC_CONFLICT_READ_RULES);
    expect(definitions.syncConflictRead.groupKeys).toEqual({ nodeConflicts: 'nodeConflicts' });
    expect(definitions.syncConflictRead.nodeConflicts).toEqual({ queryName: 'nodeConflicts' });
  });

  it('keeps DatabaseHelper out of direct conflict query selection', async () => {
    const helperSource = await readFile(DATABASE_HELPER, 'utf8');
    const conflictRulesSource = await readFile(CONFLICT_RULES, 'utf8');

    expect(helperSource).toContain('FolioleCompanionSyncConflictQueryRules.nodeConflictsQueryName(context)');
    expect(helperSource).not.toContain('"nodeConflicts"');
    expect(conflictRulesSource).toContain('FolioleCompanionQueryAssetKeys.ruleGroup(context, "syncConflictRead", "nodeConflicts")');
    expect(conflictRulesSource).toContain('nodeConflictsQueryName(Context context)');
    expect(conflictRulesSource).toContain('nodeConflictsString(context, "queryName")');
    expect(conflictRulesSource).not.toContain('optJSONObject("nodeConflicts")');
    expect(conflictRulesSource).not.toContain('database, "nodeConflicts"');
  });
});
