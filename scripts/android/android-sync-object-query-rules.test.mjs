// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_SYNC_OBJECT_READ_RULES } from '../../lib/core/database/androidCompanionSyncQueryDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const SYNC_OBJECT_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncObjectStore.java');
const SYNC_OBJECT_QUERY_RULES = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncObjectQueryRules.java'
);

describe('Android sync object query rules', () => {
  it('generates sync object read routing and limit rules', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.syncObjectRead).toEqual(ANDROID_COMPANION_SYNC_OBJECT_READ_RULES);
    expect(definitions.syncObjectRead.groupKeys).toEqual({
      syncIndex: 'syncIndex',
      syncObjects: 'syncObjects',
      syncStateChanges: 'syncStateChanges'
    });
    expect(definitions.syncObjectRead.syncObjects).toMatchObject({
      objectIdsReplacement: ':objectIds',
      objectTypesReplacement: ':objectTypes',
      queryName: 'syncObjects',
      resultKey: 'objects'
    });
    expect(definitions.syncObjectRead.syncStateChanges).toMatchObject({
      defaultLimit: 500,
      maxLimit: 1000,
      minCursor: 0,
      minLimit: 1
    });
  });

  it('keeps SyncObjectStore wired to generated read rules instead of inline query literals', async () => {
    const storeSource = await readFile(SYNC_OBJECT_STORE, 'utf8');
    const rulesSource = await readFile(SYNC_OBJECT_QUERY_RULES, 'utf8');

    expect(storeSource).toContain('FolioleCompanionSyncObjectQueryRules.syncObjectsQueryName(context)');
    expect(storeSource).toContain('FolioleCompanionSyncObjectQueryRules.syncStateChangesQueryName(context)');
    expect(storeSource).toContain('FolioleCompanionSyncObjectQueryRules.emptySyncObjects(context)');
    expect(rulesSource).toContain('FolioleCompanionQueryAssetKeys.section(context, "syncObjectRead")');
    expect(rulesSource).toContain('syncObjectsGroup(context)');
    expect(rulesSource).toContain('syncStateChangesGroup(context)');
    expect(rulesSource).not.toContain('group(context, "syncObjects").');
    expect(rulesSource).not.toContain('group(context, "syncStateChanges").');
    expect(storeSource).not.toContain('"syncObjects"');
    expect(storeSource).not.toContain('"syncStateChanges"');
    expect(storeSource).not.toContain('Math.max(1, Math.min(1000');
  });
});
