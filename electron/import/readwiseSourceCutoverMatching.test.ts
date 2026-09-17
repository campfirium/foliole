// @vitest-environment node

import { expect, it } from 'vitest';

import type { ReaderDocumentContract } from '../../lib/core/readwise/readwiseApiContract.js';
import { prepareReadwiseApiDocuments } from '../../lib/core/readwise/readwiseApiImport.js';

import type { ReadwiseSourceArtifact } from './readwiseSourceCutoverArtifacts.js';
import { matchReadwiseSourceCutover } from './readwiseSourceCutoverMatching.js';
import {
  extractReadwiseNumericDocumentId,
  extractReadwiseSourceUrl
} from './readwiseSourceCutoverSourceUrl.js';

it('matches active and dismissed sources by Reader ID or canonical source URL', () => {
  const reader = [
    remote('id-match', 'article', 'Different', 'https://example.com/id'),
    remote('url-match', 'article', 'Different too', 'https://EXAMPLE.com/url/#fragment')
  ];
  const output = matchReadwiseSourceCutover({
    artifacts: [
      artifact('legacy-id', 'articles', 'Old', null, ['id-match'], true),
      artifact('legacy-url', 'articles', 'Old', 'https://example.com/url', []),
    ],
    preparedDocuments: prepareReadwiseApiDocuments(reader, []),
    readerDocuments: reader
  });

  expect(output.artifactFor('id-match')?.latestNodeId).toBe('legacy-id');
  expect(output.artifactFor('url-match')?.latestNodeId).toBe('legacy-url');
  expect(output.failures).toEqual([]);
});

it('does not guess across identity or URL conflicts', () => {
  const reader = [
    remote('one', 'article', 'Duplicate', 'https://example.com/shared'),
    remote('two', 'article', 'Duplicate', 'https://example.com/shared')
  ];
  const output = matchReadwiseSourceCutover({
    artifacts: [
      artifact('identity-conflict', 'articles', 'Duplicate', null, ['one', 'two']),
      artifact('url-conflict', 'articles', 'Duplicate', 'https://example.com/shared', [])
    ],
    preparedDocuments: prepareReadwiseApiDocuments(reader, []),
    readerDocuments: reader
  });

  expect(output.matchedDocumentIds.size).toBe(0);
  expect(output.failures).toEqual(expect.arrayContaining([
    { nodeId: 'identity-conflict', reason: 'identity_conflict' },
    { nodeId: 'url-conflict', reason: 'url_not_unique' }
  ]));
});

it('does not use a unique full title as identity evidence', () => {
  const reader = [remote('article', 'article', 'Same title', null)];
  const output = matchReadwiseSourceCutover({
    artifacts: [artifact('legacy-book', 'books', 'Same title', null, [])],
    preparedDocuments: prepareReadwiseApiDocuments(reader, []),
    readerDocuments: reader
  });

  expect(output.artifactFor('article')).toBeNull();
  expect(output.failures).toEqual([{ nodeId: 'legacy-book', reason: 'unmatched' }]);
});

it('uses an explicit source link in converted document bodies when sourceUrl is absent', () => {
  const reader = [remote('email', 'email', 'Repeated mail title', null,
    '<p><a href="https://forum.example.com/topic/8/81">访问话题</a></p>')];
  const output = matchReadwiseSourceCutover({
    artifacts: [artifact('legacy-email', 'articles', 'Repeated mail title',
      'https://forum.example.com/topic/8/81', [])],
    preparedDocuments: prepareReadwiseApiDocuments(reader, []),
    readerDocuments: reader
  });

  expect(output.artifactFor('email')?.latestNodeId).toBe('legacy-email');
  expect(output.failures).toEqual([]);
});

it('matches a legacy EPUB download link to the Reader raw source document id', () => {
  const reader = [remote('epub', 'epub', 'Book', null, '<p>Fresh book body.</p>',
    'https://readwise-assets.s3.amazonaws.com/private/reader/cloud_docs/ParsedDocument33661889.epub?signature=x')];
  const legacy = artifact('legacy-epub', 'books', 'Book', null, []);
  legacy.raw = '[Download original file](https://readwise.io/reader/document_raw_content/33661889)';
  const output = matchReadwiseSourceCutover({
    artifacts: [legacy],
    preparedDocuments: prepareReadwiseApiDocuments(reader, []),
    readerDocuments: reader
  });

  expect(output.artifactFor('epub')?.latestNodeId).toBe('legacy-epub');
  expect(output.failures).toEqual([]);
});

it('does not guess when a Reader numeric document id is duplicated', () => {
  const reader = [remote('epub', 'epub', 'Book', null, '<p>Fresh book body.</p>',
    'https://readwise-assets.s3.amazonaws.com/ParsedDocument33661889.epub')];
  const first = artifact('legacy-a', 'books', 'Book A', null, []);
  const second = artifact('legacy-b', 'books', 'Book B', null, []);
  first.raw = 'https://readwise.io/reader/document_raw_content/33661889';
  second.raw = 'https://readwise.io/reader/document_raw_content/33661889';
  const output = matchReadwiseSourceCutover({
    artifacts: [first, second],
    preparedDocuments: prepareReadwiseApiDocuments(reader, []),
    readerDocuments: reader
  });

  expect(output.artifactFor('epub')).toBeNull();
  expect(output.failures).toEqual(expect.arrayContaining([
    { nodeId: 'legacy-a', reason: 'identity_conflict' },
    { nodeId: 'legacy-b', reason: 'identity_conflict' }
  ]));
});

it('lets an exact Reader ID win when another document shares its source URL', () => {
  const reader = [
    remote('exact', 'article', 'One', 'https://example.com/shared'),
    remote('duplicate', 'rss', 'Two', 'https://example.com/shared')
  ];
  const output = matchReadwiseSourceCutover({
    artifacts: [artifact('legacy', 'articles', 'Old', 'https://example.com/shared', ['exact'])],
    preparedDocuments: prepareReadwiseApiDocuments(reader, []),
    readerDocuments: reader
  });

  expect(output.artifactFor('exact')?.latestNodeId).toBe('legacy');
  expect(output.artifactFor('duplicate')).toBeNull();
});

it('reads the explicit legacy URL field and labeled body source links', () => {
  expect(extractReadwiseSourceUrl('---\nurl: https://example.com/article\n---')).toBe(
    'https://example.com/article'
  );
  expect(extractReadwiseSourceUrl('[访问话题](https://forum.example.com/topic/8/81)')).toBe(
    'https://forum.example.com/topic/8/81'
  );
  expect(extractReadwiseSourceUrl('url: https://readwise.io/reader/document_raw_content/123')).toBe(
    'https://readwise.io/reader/document_raw_content/123'
  );
  expect(extractReadwiseNumericDocumentId(
    '[Download original file](https://readwise.io/reader/document_raw_content/33661889)'
  )).toBe('33661889');
  expect(extractReadwiseNumericDocumentId(
    'https://readwise-assets.s3.amazonaws.com/cloud_docs/ParsedDocument33661889.epub?signature=x'
  )).toBe('33661889');
});

function artifact(
  nodeId: string,
  sourceCategory: NonNullable<ReadwiseSourceArtifact['sourceCategory']>,
  title: string,
  originalUrl: string | null,
  ids: string[],
  dismissed = false
): ReadwiseSourceArtifact {
  return {
    disposition: dismissed ? {
      disposition: 'dismissed',
      key: { originalTitle: title, sourceKind: 'readwise', sourceScope: 'legacy:.' },
      ruleId: 'legacy',
      sourcePath: `${title}.md`
    } : null,
    documentIds: new Set(ids),
    highlightIds: new Set(),
    latestNodeId: nodeId,
    nodeActive: true,
    originalUrl,
    raw: '',
    sourceCategory,
    sourceFingerprint: `${nodeId}-source`,
    title
  };
}

function remote(
  id: string,
  category: ReaderDocumentContract['category'],
  title: string,
  sourceUrl: string | null,
  htmlContent = `<p>${title}</p>`,
  rawSourceUrl: string | null = null
): ReaderDocumentContract {
  return {
    author: null,
    category,
    htmlContent,
    id,
    imageUrl: null,
    notes: null,
    parentId: null,
    rawSourceUrl,
    sourceUrl,
    summary: null,
    tags: null,
    title,
    updatedAt: null,
    url: null
  };
}
