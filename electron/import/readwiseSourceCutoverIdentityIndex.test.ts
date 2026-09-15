// @vitest-environment node

import { expect, it } from 'vitest';

import type { ReaderDocumentContract } from '../../lib/core/readwise/readwiseApiContract.js';

import type { ReadwiseSourceArtifact } from './readwiseSourceCutoverArtifacts.js';
import { resolveReadwiseSourceIdentityIndex } from './readwiseSourceCutoverIdentityIndex.js';

it('resolves a stored highlight through its typed parent chain to the local node id', () => {
  const index = resolveReadwiseSourceIdentityIndex([
    artifact('moved-topic', ['highlight-1'])
  ], new Map([
    ['highlight-1', document('highlight-1', 'highlight', 'document-1')],
    ['document-1', document('document-1', 'epub', null)]
  ]));

  expect(index.byDocument.get('document-1')).toMatchObject({
    latestNodeId: 'moved-topic', remoteDocumentId: 'document-1'
  });
});

it('fails closed when a local Readwise record has no resolvable stored id', () => {
  expect(() => resolveReadwiseSourceIdentityIndex([
    artifact('local-topic', [])
  ], new Map())).toThrow('readwise_source_cutover_identity_unmatched');
});

it('fails closed when one remote document resolves to two local node ids', () => {
  const documents = new Map([['document-1', document('document-1', 'article', null)]]);
  expect(() => resolveReadwiseSourceIdentityIndex([
    artifact('local-a', ['document-1']), artifact('local-b', ['document-1'])
  ], documents)).toThrow('readwise_source_cutover_identity_conflict');
});

function artifact(nodeId: string, ids: string[]): ReadwiseSourceArtifact {
  return {
    disposition: null,
    documentIds: new Set(ids),
    highlightIds: new Set(ids),
    latestNodeId: nodeId,
    nodeActive: true,
    raw: '',
    sourceFingerprint: null
  };
}

function document(
  id: string,
  category: ReaderDocumentContract['category'],
  parentId: string | null
): ReaderDocumentContract {
  return {
    author: null, category, htmlContent: null, id, imageUrl: null, notes: null,
    parentId, rawSourceUrl: null, sourceUrl: null, summary: null, title: null,
    updatedAt: null, url: null
  };
}
