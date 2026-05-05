// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_RESOURCE_READ_RULES } from '../../lib/core/database/androidCompanionResourceQueryDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const CONTENT_BLOB_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionContentBlobStore.java');
const ATTACHMENT_RESOURCE_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionAttachmentResourceStore.java');
const PDF_PAGE_TEXT_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionPdfPageTextStore.java');
const RESOURCE_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionResourceReadQueryRules.java');

describe('Android resource read query rules', () => {
  it('generates content blob, attachment resource, and PDF text read metadata', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.resourceRead).toEqual(ANDROID_COMPANION_RESOURCE_READ_RULES);
    expect(definitions.resourceRead.contentBlobs).toMatchObject({
      existingQueryName: 'contentBlobDataExisting',
      manifestQueryName: 'contentBlobManifestByHash',
      resultKey: 'blobs'
    });
    expect(definitions.resourceRead.attachmentResources).toMatchObject({
      resolveQueryName: 'attachmentResourceResolve',
      resultKey: 'resources'
    });
    expect(definitions.resourceRead.pdfPageText).toMatchObject({
      defaultSearchLimit: 20,
      excerptRadius: 80,
      maxSearchLimit: 100,
      pagesQueryName: 'pdfPageTextPages',
      searchQueryName: 'pdfPageTextSearch',
      searchResultKey: 'results'
    });
  });

  it('keeps resource Java stores wired to generated read rules', async () => {
    const combinedStoreSource = [
      await readFile(CONTENT_BLOB_STORE, 'utf8'),
      await readFile(ATTACHMENT_RESOURCE_STORE, 'utf8'),
      await readFile(PDF_PAGE_TEXT_STORE, 'utf8')
    ].join('\n');
    const rulesSource = await readFile(RESOURCE_RULES, 'utf8');

    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.contentBlobString(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.attachmentString(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionResourceReadQueryRules.pdfPageTextString(context, key)');
    expect(rulesSource).toContain('optJSONObject("resourceRead")');
    expect(combinedStoreSource).not.toContain('"contentBlobManifestByHash"');
    expect(combinedStoreSource).not.toContain('"contentBlobDataExisting"');
    expect(combinedStoreSource).not.toContain('"attachmentResourceResolve"');
    expect(combinedStoreSource).not.toContain('"pdfPageTextPages"');
    expect(combinedStoreSource).not.toContain('"pdfPageTextSearch"');
    expect(combinedStoreSource).not.toContain('DEFAULT_SEARCH_LIMIT');
    expect(combinedStoreSource).not.toContain('EXCERPT_RADIUS');
  });
});
