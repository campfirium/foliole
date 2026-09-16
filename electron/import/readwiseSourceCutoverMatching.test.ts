// @vitest-environment node

import { expect, it } from 'vitest';

import type { ReaderDocumentContract } from '../../lib/core/readwise/readwiseApiContract.js';
import { prepareReadwiseApiDocuments } from '../../lib/core/readwise/readwiseApiImport.js';

import type { ReadwiseSourceArtifact } from './readwiseSourceCutoverArtifacts.js';
import { matchReadwiseSourceCutover } from './readwiseSourceCutoverMatching.js';

it('matches in Reader ID, canonical URL, then category-scoped unique full title order', () => {
  const reader = [
    remote('id-match', 'article', 'Different', 'https://example.com/id'),
    remote('url-match', 'article', 'Different too', 'https://EXAMPLE.com/url/#fragment'),
    remote('title-match', 'epub', '  Shared   Book  ', null)
  ];
  const output = matchReadwiseSourceCutover({
    artifacts: [
      artifact('legacy-id', 'articles', 'Old', null, ['id-match']),
      artifact('legacy-url', 'articles', 'Old', 'https://example.com/url', []),
      artifact('legacy-title', 'books', 'shared book', null, [])
    ],
    preparedDocuments: prepareReadwiseApiDocuments(reader, []),
    readerDocuments: reader
  });

  expect(output.artifactFor('id-match')?.latestNodeId).toBe('legacy-id');
  expect(output.artifactFor('url-match')?.latestNodeId).toBe('legacy-url');
  expect(output.artifactFor('title-match')?.latestNodeId).toBe('legacy-title');
  expect(output.failures).toEqual([]);
});

it('does not guess across identity, URL, or title conflicts', () => {
  const reader = [
    remote('one', 'article', 'Duplicate', 'https://example.com/shared'),
    remote('two', 'article', 'Duplicate', 'https://example.com/shared')
  ];
  const output = matchReadwiseSourceCutover({
    artifacts: [
      artifact('identity-conflict', 'articles', 'Duplicate', null, ['one', 'two']),
      artifact('url-conflict', 'articles', 'Duplicate', 'https://example.com/shared', []),
      artifact('title-conflict', 'articles', 'Duplicate', null, [])
    ],
    preparedDocuments: prepareReadwiseApiDocuments(reader, []),
    readerDocuments: reader
  });

  expect(output.matchedDocumentIds.size).toBe(0);
  expect(output.failures).toEqual(expect.arrayContaining([
    { nodeId: 'identity-conflict', reason: 'identity_conflict' },
    { nodeId: 'url-conflict', reason: 'url_not_unique' },
    { nodeId: 'title-conflict', reason: 'title_not_unique' }
  ]));
});

it('requires the legacy category to agree for title-only matches', () => {
  const reader = [remote('article', 'article', 'Same title', null)];
  const output = matchReadwiseSourceCutover({
    artifacts: [artifact('legacy-book', 'books', 'Same title', null, [])],
    preparedDocuments: prepareReadwiseApiDocuments(reader, []),
    readerDocuments: reader
  });

  expect(output.artifactFor('article')).toBeNull();
  expect(output.failures).toEqual([{ nodeId: 'legacy-book', reason: 'unmatched' }]);
});

function artifact(
  nodeId: string,
  sourceCategory: NonNullable<ReadwiseSourceArtifact['sourceCategory']>,
  title: string,
  originalUrl: string | null,
  ids: string[]
): ReadwiseSourceArtifact {
  return {
    disposition: null,
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
  sourceUrl: string | null
): ReaderDocumentContract {
  return {
    author: null,
    category,
    htmlContent: `<p>${title}</p>`,
    id,
    imageUrl: null,
    notes: null,
    parentId: null,
    rawSourceUrl: null,
    sourceUrl,
    summary: null,
    tags: null,
    title,
    updatedAt: null,
    url: null
  };
}
