// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_RESOURCE_MUTATION_RULES } from '../../lib/core/database/androidCompanionMutationDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MUTATION_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-mutation-definitions.json');
const CONTENT_BLOB_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionContentBlobStore.java');
const CONTENT_BLOB_BATCH_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionContentBlobBatchStore.java');
const ATTACHMENT_RESOURCE_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionAttachmentResourceStore.java');
const ATTACHMENT_RESOURCE_BATCH_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionAttachmentResourceBatchStore.java');
const RESOURCE_MUTATION_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionResourceMutationRules.java');

describe('Android resource mutation rules', () => {
  it('generates resource mutation metadata', async () => {
    const definitions = JSON.parse(await readFile(MUTATION_DEFINITIONS, 'utf8'));

    expect(definitions.resourceMutations).toEqual(ANDROID_COMPANION_RESOURCE_MUTATION_RULES);
    expect(definitions.resourceMutations.attachmentResources).toMatchObject({
      markCachedMutationName: 'attachmentResourceMarkCached',
      markFailedMutationName: 'attachmentResourceMarkFailed'
    });
    expect(definitions.resourceMutations.contentBlobs).toMatchObject({
      dataReplaceMutationName: 'contentBlobDataReplace',
      markCachedMutationName: 'contentBlobMarkCached',
      markFailedMutationName: 'contentBlobMarkFailed',
      markFetchingMutationName: 'contentBlobMarkFetching'
    });
  });

  it('keeps resource Java stores wired to generated mutation rules', async () => {
    const combinedStoreSource = [
      await readFile(CONTENT_BLOB_STORE, 'utf8'),
      await readFile(CONTENT_BLOB_BATCH_STORE, 'utf8'),
      await readFile(ATTACHMENT_RESOURCE_STORE, 'utf8'),
      await readFile(ATTACHMENT_RESOURCE_BATCH_STORE, 'utf8')
    ].join('\n');
    const rulesSource = await readFile(RESOURCE_MUTATION_RULES, 'utf8');

    expect(combinedStoreSource).toContain('FolioleCompanionResourceMutationRules.contentBlobString(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceMutationRules.attachmentString(context, key)');
    expect(rulesSource).toContain('optJSONObject("resourceMutations")');
    expect(combinedStoreSource).not.toContain('"contentBlobDataReplace"');
    expect(combinedStoreSource).not.toContain('"contentBlobMarkCached"');
    expect(combinedStoreSource).not.toContain('"contentBlobMarkFetching"');
    expect(combinedStoreSource).not.toContain('"contentBlobMarkFailed"');
    expect(combinedStoreSource).not.toContain('"attachmentResourceMarkCached"');
    expect(combinedStoreSource).not.toContain('"attachmentResourceMarkFailed"');
    expect(combinedStoreSource).not.toContain('"attachmentResourceContentHashesByIds"');
    expect(combinedStoreSource).not.toContain('"__ATTACHMENT_ID_FILTER__"');
  });
});
