// @vitest-environment node

import { expect, it, vi } from 'vitest';

import type { ReaderDocumentContract } from '../../lib/core/readwise/readwiseApiContract.js';
import { prepareReadwiseApiDocuments } from '../../lib/core/readwise/readwiseApiImport.js';

import type { ReadwiseSourceArtifact } from './readwiseSourceCutoverArtifacts.js';
import { matchReadwiseSourceCutover } from './readwiseSourceCutoverMatching.js';

it.each([40, 400])('bounds successful-artifact enumeration for a %i-source cutover', (size) => {
  const artifacts = Array.from({ length: size }, (_, i) => artifact(`local-${i}`, [`remote-${i}`]));
  const readers = artifacts.map((_, i) => reader(`remote-${i}`));
  const known = new Set(artifacts);
  const originalValues = Map.prototype.values;
  let visits = 0;
  const spy = vi.spyOn(Map.prototype, 'values').mockImplementation(function* (this: Map<unknown, unknown>) {
    for (const value of originalValues.call(this)) {
      if (known.has(value as ReadwiseSourceArtifact)) visits++;
      yield value;
    }
    return undefined;
  });
  let output: ReturnType<typeof matchReadwiseSourceCutover>;
  try {
    output = matchReadwiseSourceCutover({ artifacts,
      preparedDocuments: prepareReadwiseApiDocuments(readers, []), readerDocuments: readers });
  } finally {
    spy.mockRestore();
  }
  expect(output.failures).toEqual([]);
  expect([...output.matchedDocumentIds]).toEqual(readers.map((item) => item.id));
  artifacts.forEach((item, i) => expect(output.artifactFor(`remote-${i}`)).toBe(item));
  expect(visits).toBeLessThanOrEqual(4 * size);
});

it('retains complete ordered failures across grouped, inactive, identity, ancestor, numeric and URL inputs', () => {
  const exact = artifact('exact-local', ['exact']);
  const ancestor = artifact('ancestor-local');
  ancestor.highlightIds.add('highlight');
  const numeric = artifact('numeric-local');
  numeric.raw = 'https://readwise.io/reader/document_raw_content/123';
  const url = artifact('url-local', [], 'https://example.com/unique');
  const inactive = { ...artifact('inactive'), nodeActive: false };
  const readers = [reader('exact'), reader('ancestor'), reader('numeric'),
    reader('url', 'https://example.com/unique/'), reader('url-a', 'https://example.com/shared'),
    reader('url-b', 'https://example.com/shared'), reader('highlight')];
  readers[2]!.rawSourceUrl = 'https://readwise-assets.s3.amazonaws.com/ParsedDocument123.epub';
  readers[6]!.category = 'highlight';
  readers[6]!.parentId = 'ancestor';
  const output = matchReadwiseSourceCutover({
    artifacts: [artifact('missing'), exact, artifact('conflict', ['exact', 'ancestor']),
      ancestor, numeric, artifact('url-conflict', [], 'https://example.com/shared'),
      url, inactive, artifact('missing'), artifact('last')],
    preparedDocuments: prepareReadwiseApiDocuments(readers, []), readerDocuments: readers
  });
  expect(output.failures).toEqual([
    { nodeId: 'missing', reason: 'unmatched' },
    { nodeId: 'conflict', reason: 'identity_conflict' },
    { nodeId: 'url-conflict', reason: 'url_not_unique' },
    { nodeId: 'last', reason: 'unmatched' }
  ]);
  expect([...output.matchedDocumentIds]).toEqual(['exact', 'ancestor', 'numeric', 'url']);
  for (const item of [exact, ancestor, numeric, url]) {
    expect(output.artifactFor(item.latestNodeId.replace('-local', ''))).toBe(item);
  }
  expect(output.artifactFor('absent')).toBeNull();
});

it('returns all unmatched active sources and handles an empty batch', () => {
  const output = matchReadwiseSourceCutover({ artifacts: [artifact('one'), artifact('two')],
    preparedDocuments: [], readerDocuments: [] });
  expect(output.failures).toEqual(['one', 'two'].map((nodeId) => ({ nodeId, reason: 'unmatched' })));
  const empty = matchReadwiseSourceCutover({ artifacts: [], preparedDocuments: [], readerDocuments: [] });
  expect(empty.failures).toEqual([]);
  expect(empty.matchedDocumentIds.size).toBe(0);
});

function artifact(id: string, ids: string[] = [], url: string | null = null): ReadwiseSourceArtifact {
  return { disposition: null, documentIds: new Set(ids), highlightIds: new Set(), latestNodeId: id,
    nodeActive: true, originalUrl: url, raw: '', sourceCategory: 'articles',
    sourceFingerprint: id, title: id };
}

function reader(id: string, url: string | null = null): ReaderDocumentContract {
  return { author: null, category: 'article', htmlContent: `<p>${id}</p>`, id, imageUrl: null,
    notes: null, parentId: null, rawSourceUrl: null, sourceUrl: url, summary: null,
    tags: null, title: id, updatedAt: null, url: null };
}
