// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_RUNTIME_MUTATION_RULES } from '../../lib/core/database/androidCompanionMutationDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MUTATION_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-mutation-definitions.json');
const MUTATION_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionNamedMutationStore.java');
const RUNTIME_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionRuntimeMutationRules.java');

describe('Android runtime mutation rules', () => {
  it('generates runtime mutation metadata', async () => {
    const definitions = JSON.parse(await readFile(MUTATION_DEFINITIONS, 'utf8'));

    expect(definitions.assetKeys).toMatchObject({
      runtimeMutations: 'runtimeMutations',
      statements: 'statements'
    });
    expect(definitions.runtimeMutations).toEqual(ANDROID_COMPANION_RUNTIME_MUTATION_RULES);
    expect(definitions.runtimeMutations).toMatchObject({
      syncPushAck: { deleteByObjectMutationName: 'syncPushAckDeleteByObject', tableName: 'sync_push_ack' },
      syncState: { upsertMutationName: 'syncStateUpsert' }
    });
  });

  it('keeps runtime mutation adapter wired to generated mutation rules', async () => {
    const storeSource = await readFile(MUTATION_STORE, 'utf8');
    const rulesSource = await readFile(RUNTIME_RULES, 'utf8');

    expect(storeSource).toContain('FolioleCompanionRuntimeMutationRules.syncStateString(context, key)');
    expect(storeSource).toContain('FolioleCompanionRuntimeMutationRules.syncPushAckString(context, key)');
    expect(rulesSource).toContain('FolioleCompanionMutationAssetKeys.key(context, "runtimeMutations")');
    expect(rulesSource).not.toContain('optJSONObject("runtimeMutations")');
    expect(storeSource).not.toContain('"syncStateUpsert"');
    expect(storeSource).not.toContain('"syncPushAckDeleteByObject"');
    expect(storeSource).not.toContain('"sync_push_ack"');
  });
});
