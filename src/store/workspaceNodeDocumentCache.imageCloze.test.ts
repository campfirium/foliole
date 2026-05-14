import { afterEach, expect, it } from 'vitest';

import {
  listWorkspaceNodeDocumentPrefetchCandidates,
  readCachedWorkspaceNodeDocument,
  resetWorkspaceNodeDocumentCacheForTest,
  toWorkspaceNodeDocument,
  writeCachedWorkspaceNodeDocument
} from './workspaceNodeDocumentCache';
import { createInitialWorkspaceState } from './workspaceStore';

afterEach(() => {
  resetWorkspaceNodeDocumentCacheForTest();
});

it('keeps cleared image regions as null in cached node documents', () => {
  const seedNode = createInitialWorkspaceState(new Date('2026-04-10T00:00:00.000Z')).nodesById['node-1']!;
  const document = toWorkspaceNodeDocument({
    ...seedNode,
    kind: 'topic',
    content: '![Cover](asset://hash-1.png)',
    imageRegions: null
  });

  expect(document.imageRegions).toBeNull();
});

it('bounds cached workspace node documents with LRU eviction', () => {
  for (let index = 0; index < 256; index += 1) {
    writeCachedWorkspaceNodeDocument(`node-${index}`, {
      content: `content-${index}`,
      hideTitleHeading: false,
      imageRegions: null,
      kind: 'topic',
      reveal: '',
      virtualFilter: null
    });
  }

  expect(readCachedWorkspaceNodeDocument('node-0')?.content).toBe('content-0');
  writeCachedWorkspaceNodeDocument('node-256', {
    content: 'content-256',
    hideTitleHeading: false,
    imageRegions: null,
    kind: 'topic',
    reveal: '',
    virtualFilter: null
  });

  expect(readCachedWorkspaceNodeDocument('node-1')).toBeNull();
  expect(readCachedWorkspaceNodeDocument('node-0')?.content).toBe('content-0');
});

it('keeps prefetch candidate volume below the document cache limit', () => {
  const state = createInitialWorkspaceState(new Date('2026-04-10T00:00:00.000Z'));
  const candidates = listWorkspaceNodeDocumentPrefetchCandidates({
    activeNodeId: 'node-1',
    navigationBackStack: Array.from({ length: 40 }, (_, index) => `history-${index}`),
    nodeOrder: state.nodeOrder,
    nodesById: state.nodesById,
    visibleNodeIds: Array.from({ length: 80 }, (_, index) => `visible-${index}`)
  });

  expect(candidates.length).toBeLessThan(256);
});
