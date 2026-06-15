// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_CONTENT_READ_RULES } from '../../lib/core/database/androidCompanionResourceQueryDefinitions.ts';
import { ANDROID_COMPANION_DOCUMENT_RESOURCE_QUERY_DEFINITIONS } from '../../lib/core/database/androidCompanionDocumentResourceQueryDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const EXTERNAL_DOCUMENT_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionExternalDocumentStore.java');
const READABLE_ARTICLE_QUERY = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionReadableArticleQuery.java');
const TOPIC_SEARCH_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionTopicSearchStore.java');
const CONTENT_READ_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionContentReadQueryRules.java');
const DESKTOP_PHYSICAL_DATABASE_FILE_NAMES = [
  'external-search-cache.db',
  'foliole-external.db',
  'foliole-index.db',
  'foliole-search.db'
];

describe('Android content read query rules', () => {
  it('generates external document and readable article read metadata', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.contentRead).toEqual(ANDROID_COMPANION_CONTENT_READ_RULES);
    expect(definitions.contentRead.groupKeys).toEqual({
      externalDocuments: 'externalDocuments',
      readableArticle: 'readableArticle',
      topicSearch: 'topicSearch'
    });
    expect(definitions.contentRead.externalDocuments).toMatchObject({
      byIdQueryName: 'externalDocumentById',
      defaultSearchLimit: 20,
      directoryEntriesQueryName: 'externalDocumentDirectoryEntries',
      excerptRadius: 80,
      outputKeys: {
        document: 'document',
        excerpt: 'excerpt',
        matchStart: 'match_start',
        results: 'results'
      },
      rowKeys: {
        bodyBlobHash: 'body_blob_hash',
        contentStatus: 'content_status',
        documentId: 'document_id',
        excerpt: 'excerpt',
        matchStart: 'match_start'
      },
      searchQueryName: 'externalDocumentSearch'
    });
    expect(definitions.contentRead.readableArticle).toMatchObject({
      activeNodeIdQueryName: 'readableArticleActiveNodeId',
      firstNodeQueryName: 'readableArticleFirstNode',
      outputKeys: {
        contentStatus: 'content_status',
        nodeId: 'node_id'
      },
      pdfPagesQueryName: 'pdfPageTextPages',
      referencePdfAttachmentQueryName: 'readableArticleReferencePdfAttachment',
      rowKeys: {
        bodyBlobHash: 'body_blob_hash',
        contentStatus: 'content_status',
        id: 'id',
        pdfAttachmentId: 'pdf_attachment_id'
      }
    });
    expect(definitions.contentRead.externalDocuments.searchResultFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outputKey: 'content_status', rowKey: 'content_status', type: 'string' }),
        expect.objectContaining({ outputKey: 'match_start', rowKey: 'match_start', type: 'long' }),
        expect.objectContaining({ outputKey: 'excerpt', rowKey: 'excerpt', type: 'string' })
      ])
    );
    expect(definitions.queries.externalDocumentSearch).toEqual(
      ANDROID_COMPANION_DOCUMENT_RESOURCE_QUERY_DEFINITIONS.externalDocumentSearch
    );
    expect(definitions.queries.externalDocumentSearch.sql).toContain('FROM external_documents');
    expect(definitions.queries.externalDocumentSearch.sql).toContain('LEFT JOIN content_blobs');
    expect(definitions.queries.externalDocumentSearch.sql).toContain('LEFT JOIN content_blob_data');
    expect(definitions.queries.externalDocumentSearch.sql).not.toContain('external_search_documents');
    expect(definitions.queries.externalDocumentSearch.sql).not.toContain('external_search_fts');
    expect(definitions.queries.topicSearch.sql).toContain('FROM nodes');
    expect(definitions.queries.topicSearch.sql).toContain('LEFT JOIN content_blobs');
    expect(definitions.queries.topicSearch.sql).toContain('LEFT JOIN content_blob_data');
    expect(definitions.queries.topicSearch.sql).not.toContain('external_search_fts');
    expect(definitions.queries.topicSearch.sql).not.toContain('foliole-search.db');
    for (const fileName of DESKTOP_PHYSICAL_DATABASE_FILE_NAMES) {
      expect(JSON.stringify(definitions.contentRead)).not.toContain(fileName);
      expect(JSON.stringify(definitions.queries.externalDocumentSearch)).not.toContain(fileName);
    }
    expect(definitions.contentRead.readableArticle.articleFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outputKey: 'node_id', rowKey: 'id', type: 'string' }),
        expect.objectContaining({ outputKey: 'content_status', rowKey: 'content_status', type: 'string' }),
        expect.objectContaining({ outputKey: 'pdf_attachment_id', rowKey: 'pdf_attachment_id', type: 'nullableString' })
      ])
    );
  });

  it('keeps content read Java stores wired to generated query rules', async () => {
    const combinedStoreSource = [
      await readFile(EXTERNAL_DOCUMENT_STORE, 'utf8'),
      await readFile(READABLE_ARTICLE_QUERY, 'utf8'),
      await readFile(TOPIC_SEARCH_STORE, 'utf8')
    ].join('\n');
    const rulesSource = await readFile(CONTENT_READ_RULES, 'utf8');

    expect(combinedStoreSource).toContain('FolioleCompanionContentReadQueryRules.externalDocumentString(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionContentReadQueryRules.externalDocumentArray(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionContentReadQueryRules.externalDocumentOutputKey(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionContentReadQueryRules.externalDocumentRowNullableString(context, row, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionContentReadQueryRules.externalDocumentRowString(context, row, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.fieldOutputKey(context, field)');
    expect(combinedStoreSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.fieldRowLong(context, row, field)');
    expect(combinedStoreSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.fieldRowNullableString(context, row, field)');
    expect(combinedStoreSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.fieldTypeKey(context, field)');
    expect(combinedStoreSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.fieldType(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionContentReadQueryRules.readableArticleString(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionContentReadQueryRules.readableArticleOutputKey(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionContentReadQueryRules.readableArticleArray(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionContentReadQueryRules.topicSearchString(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionContentReadQueryRules.topicSearchArray(context, key)');
    expect(combinedStoreSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.fieldRowString(context, row, field)');
    expect(rulesSource).toContain('FolioleCompanionQueryAssetKeys.ruleGroup(context, "contentRead", groupName)');
    expect(rulesSource).toContain('getJSONArray(key)');
    expect(combinedStoreSource).not.toContain('"externalDocumentById"');
    expect(combinedStoreSource).not.toContain('"readableArticleFirstNode"');
    expect(combinedStoreSource).not.toContain('"pdfPageTextPages"');
    expect(combinedStoreSource).not.toContain('row.getString(rowKey(context, "documentId"))');
    expect(combinedStoreSource).not.toContain('row.getInt(rowKey(context, "matchIndex"))');
    expect(combinedStoreSource).not.toContain('"Linked PDF source ready for the reader surface."');
    expect(combinedStoreSource).not.toContain('"readable_article"');
    expect(combinedStoreSource).not.toContain('"topicSearch"');
    expect(combinedStoreSource).not.toContain('result.put("document"');
    expect(combinedStoreSource).not.toContain('entry.put("document_id"');
    expect(combinedStoreSource).not.toContain('target.put("content_status"');
    expect(combinedStoreSource).not.toContain('article.put("node_id"');
    expect(combinedStoreSource).not.toContain('article.put("content_status"');
    expect(combinedStoreSource).not.toContain('FolioleCompanionSyncProtocolDefinitions.resourceStatusSet(context, "passthroughAvailabilityStatuses")');
    expect(combinedStoreSource).not.toContain('FolioleCompanionResourceReadQueryRules.pdfPageTextString(context, "textKey")');
    expect(combinedStoreSource).not.toContain('row.getString("document_id"');
    expect(combinedStoreSource).not.toContain('row.getString("id"');
    expect(combinedStoreSource).not.toContain('field.getString("outputKey")');
    expect(combinedStoreSource).not.toContain('field.getString("rowKey")');
    expect(combinedStoreSource).not.toContain('field.getString("type")');
    expect(combinedStoreSource).not.toContain('row.getInt("match_index"');
    expect(combinedStoreSource).not.toContain('optString("text"');
  });
});
