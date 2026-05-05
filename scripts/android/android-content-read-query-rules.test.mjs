// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_CONTENT_READ_RULES } from '../../lib/core/database/androidCompanionResourceQueryDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const EXTERNAL_DOCUMENT_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionExternalDocumentStore.java');
const READABLE_ARTICLE_QUERY = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionReadableArticleQuery.java');
const CONTENT_READ_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionContentReadQueryRules.java');

describe('Android content read query rules', () => {
  it('generates external document and readable article read metadata', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.contentRead).toEqual(ANDROID_COMPANION_CONTENT_READ_RULES);
    expect(definitions.contentRead.externalDocuments).toMatchObject({
      byIdQueryName: 'externalDocumentById',
      defaultSearchLimit: 20,
      directoryEntriesQueryName: 'externalDocumentDirectoryEntries',
      excerptRadius: 80,
      searchQueryName: 'externalDocumentSearch'
    });
    expect(definitions.contentRead.readableArticle).toMatchObject({
      activeNodeIdQueryName: 'readableArticleActiveNodeId',
      firstNodeQueryName: 'readableArticleFirstNode',
      pdfPagesQueryName: 'pdfPageTextPages',
      referencePdfAttachmentQueryName: 'readableArticleReferencePdfAttachment'
    });
  });

  it('keeps content read Java stores wired to generated query rules', async () => {
    const combinedStoreSource = `${await readFile(EXTERNAL_DOCUMENT_STORE, 'utf8')}\n${await readFile(READABLE_ARTICLE_QUERY, 'utf8')}`;
    const rulesSource = await readFile(CONTENT_READ_RULES, 'utf8');

    expect(combinedStoreSource).toContain('FolioleCompanionContentReadQueryRules.externalDocumentString(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionContentReadQueryRules.readableArticleString(context, key)');
    expect(rulesSource).toContain('optJSONObject("contentRead")');
    expect(combinedStoreSource).not.toContain('"externalDocumentById"');
    expect(combinedStoreSource).not.toContain('"readableArticleFirstNode"');
    expect(combinedStoreSource).not.toContain('"pdfPageTextPages"');
    expect(combinedStoreSource).not.toContain('"Linked PDF source ready for the reader surface."');
    expect(combinedStoreSource).not.toContain('"readable_article"');
  });
});
