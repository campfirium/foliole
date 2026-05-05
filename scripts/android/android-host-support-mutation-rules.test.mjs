// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_HOST_SUPPORT_MUTATION_RULES } from '../../lib/core/database/androidCompanionMutationDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MUTATION_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-mutation-definitions.json');
const HOST_SUPPORT_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionHostSupportMutationRules.java');
const HOST_SUPPORT_STORES = [
  'FolioleCompanionAppDataStore.java',
  'FolioleCompanionMetaRecords.java',
  'FolioleCompanionNodeAttachmentStore.java',
  'FolioleCompanionTextBodyBlobs.java'
].map((fileName) => path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android', fileName));

describe('Android host support mutation rules', () => {
  it('generates host support mutation metadata', async () => {
    const definitions = JSON.parse(await readFile(MUTATION_DEFINITIONS, 'utf8'));

    expect(definitions.hostSupportMutations).toEqual(ANDROID_COMPANION_HOST_SUPPORT_MUTATION_RULES);
    expect(definitions.hostSupportMutations.nodeAttachments).toMatchObject({
      deleteByNodeMutationName: 'nodeAttachmentDeleteByNode',
      upsertMutationName: 'nodeAttachmentUpsert'
    });
  });

  it('keeps host support Java stores wired to generated mutation rules', async () => {
    const combinedStoreSource = (await Promise.all(HOST_SUPPORT_STORES.map((file) => readFile(file, 'utf8')))).join('\n');
    const rulesSource = await readFile(HOST_SUPPORT_RULES, 'utf8');

    expect(combinedStoreSource).toContain('FolioleCompanionHostSupportMutationRules.companionMetaString(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionHostSupportMutationRules.nodeAttachmentString(context, key)');
    expect(rulesSource).toContain('FolioleCompanionMutationAssetKeys.key(context, "hostSupportMutations")');
    expect(rulesSource).not.toContain('optJSONObject("hostSupportMutations")');
    for (const mutationName of [
      'companionMetaDeleteByKey',
      'companionMetaDeleteExceptDeviceId',
      'companionMetaUpsert',
      'nodeAttachmentDeleteByNode',
      'nodeAttachmentUpsert',
      'textBodyBlobManifestInsert',
      'textBodyBlobDataInsert'
    ]) {
      expect(combinedStoreSource).not.toContain(`"${mutationName}"`);
    }
  });
});
