// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_RUNTIME_QUERY_RULES } from '../../lib/core/database/androidCompanionSyncQueryDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const META_RECORDS = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionMetaRecords.java');
const MUTATION_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionNamedMutationStore.java');
const RUNTIME_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionRuntimeQueryRules.java');

describe('Android runtime query rules', () => {
  it('generates runtime helper query metadata', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.runtimeQueries).toEqual(ANDROID_COMPANION_RUNTIME_QUERY_RULES);
    expect(definitions.runtimeQueries.groupKeys).toEqual({
      companionMeta: 'companionMeta',
      existingState: 'existingState',
      nextStateSeq: 'nextStateSeq'
    });
    expect(definitions.runtimeQueries).toMatchObject({
      companionMeta: { queryName: 'companionMetaValue' },
      nextStateSeq: { nextStateSeqKey: 'next_state_seq', queryName: 'syncStateNextSeqForMutation' }
    });
    expect(definitions.queries[definitions.runtimeQueries.existingState.queryName]).toMatchObject({
      resultKey: definitions.runtimeQueries.existingState.resultKey
    });
    expect(definitions.queries[definitions.runtimeQueries.nextStateSeq.queryName]).toMatchObject({
      resultKey: definitions.runtimeQueries.nextStateSeq.resultKey
    });
  });

  it('keeps runtime Java helpers wired to generated query rules', async () => {
    const combinedSource = `${await readFile(META_RECORDS, 'utf8')}\n${await readFile(MUTATION_STORE, 'utf8')}`;
    const rulesSource = await readFile(RUNTIME_RULES, 'utf8');

    expect(combinedSource).toContain('FolioleCompanionRuntimeQueryRules.stringValue(context, groupName, key)');
    expect(combinedSource).toContain('FolioleCompanionRuntimeQueryRules.rowString(context, groupName, row, key)');
    expect(combinedSource).toContain('FolioleCompanionRuntimeQueryRules.rowNullableString(context, groupName, row, key)');
    expect(combinedSource).toContain('FolioleCompanionRuntimeQueryRules.rowInt(context, groupName, row, key)');
    expect(combinedSource).toContain('FolioleCompanionRuntimeQueryRules.rowLong(context, groupName, row, key)');
    expect(rulesSource).toContain('FolioleCompanionQueryAssetKeys.ruleGroup(context, "runtimeQueries", groupName)');
    expect(rulesSource).not.toContain('optJSONObject(groupName)');
    expect(combinedSource).not.toContain('"companionMetaValue"');
    expect(combinedSource).not.toContain('"syncStateNextSeqForMutation"');
    expect(combinedSource).not.toContain('"next_state_seq"');
    expect(combinedSource).not.toContain('row.getString(contentHashKey)');
    expect(combinedSource).not.toContain('row.getLong(runtimeRule(context, "nextStateSeq", "nextStateSeqKey"))');
  });
});
