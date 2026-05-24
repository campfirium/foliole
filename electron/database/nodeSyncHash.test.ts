import { expect, it } from 'vitest';

import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';

function input(overrides: { manualChildOrder?: string | null; sequentialReadingEnabled: boolean | null }) {
  return {
    anchorLink: null,
    attachments: [],
    content: 'Body',
    createdAt: '2026-05-21T00:00:00.000Z',
    deletedAt: null,
    desiredRetention: null,
    enableShortTerm: null,
    manualChildOrder: null,
    hideTitleHeading: false,
    id: 'node-1',
    imageRegions: null,
    isTitleManual: true,
    kind: 'topic',
    openingText: null,
    parentId: null,
    position: null,
    priority: null,
    reveal: null,
    title: 'Node',
    updatedAt: '2026-05-21T00:00:00.000Z',
    virtualFilter: null,
    ...overrides
  };
}

it('includes sequential reading mode in node sync hashes', () => {
  expect(computeNodeSyncHash(input({ sequentialReadingEnabled: true }))).not.toBe(
    computeNodeSyncHash(input({ sequentialReadingEnabled: false }))
  );
  expect(computeNodeSyncHash(input({ sequentialReadingEnabled: null }))).not.toBe(
    computeNodeSyncHash(input({ sequentialReadingEnabled: true }))
  );
});

it('includes manual child order in node sync hashes', () => {
  expect(computeNodeSyncHash(input({ manualChildOrder: '["node-a","node-b"]', sequentialReadingEnabled: null }))).not.toBe(
    computeNodeSyncHash(input({ manualChildOrder: '["node-b","node-a"]', sequentialReadingEnabled: null }))
  );
});
