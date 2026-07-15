import { expect, it } from 'vitest';

import { hashTextBody } from '../../lib/core/database/contentBodyBlobs.js';
import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';

function input(overrides: { manualChildOrder?: string | null; sequentialReadingEnabled: boolean | null; shelvedAt?: string | null }) {
  return {
    anchorLink: null,
    attachments: [],
    content: 'Body',
    createdAt: '2026-05-21T00:00:00.000Z',
    deletedAt: null,
    desiredRetention: null,
    enableShortTerm: null,
    manualChildOrder: null,
    shelvedAt: null,
    hideTitleHeading: false,
    id: 'node-1',
    imageRegions: null,
    importContentFingerprint: null,
    importSourceFingerprint: null,
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

it('includes shelved topic state in node sync hashes', () => {
  expect(computeNodeSyncHash(input({ sequentialReadingEnabled: null, shelvedAt: '2026-05-01T00:00:00.000Z' }))).not.toBe(
    computeNodeSyncHash(input({ sequentialReadingEnabled: null, shelvedAt: null }))
  );
});

it('includes manual child order in node sync hashes', () => {
  expect(computeNodeSyncHash(input({ manualChildOrder: '["node-a","node-b"]', sequentialReadingEnabled: null }))).not.toBe(
    computeNodeSyncHash(input({ manualChildOrder: '["node-b","node-a"]', sequentialReadingEnabled: null }))
  );
});

it('includes current import provenance in node sync hashes', () => {
  const base = input({ sequentialReadingEnabled: null });
  expect(computeNodeSyncHash({
    ...base,
    importContentFingerprint: 'content-a',
    importSourceFingerprint: 'source-a'
  })).not.toBe(computeNodeSyncHash(base));
  expect(computeNodeSyncHash({
    ...base,
    importContentFingerprint: 'content-a'
  })).toBe(computeNodeSyncHash(base));
});

it('uses content as node identity while body blob hash stays derived', () => {
  const base = input({ sequentialReadingEnabled: null });
  const changed = { ...base, content: 'Changed body' };

  expect(computeNodeSyncHash(base)).not.toBe(computeNodeSyncHash(changed));
  expect(hashTextBody(base.content)).toBe(hashTextBody('Body'));
  expect(hashTextBody(base.content)).not.toBe(hashTextBody(changed.content));
});
