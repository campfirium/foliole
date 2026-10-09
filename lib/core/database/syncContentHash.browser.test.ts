import { expect, it, vi } from 'vitest';

import { buildCanonicalNodeSyncPayload, type NodeSyncHashInput } from './nodeSyncPayload.js';
import { computeSyncContentHash } from './syncState.js';

vi.mock('node:crypto', () => ({ createHash: undefined, default: { createHash: undefined } }));

async function expectedHash(text: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
}

it('validates a canonical shared state hash when the host provides no Node crypto', async () => {
  const value = { z: [1, true, null], a: 'Complete 完整😀' };
  expect(computeSyncContentHash('external_document', value))
    .toBe(await expectedHash('{"a":"Complete 完整😀","z":[1,true,null]}'));
});

it('hashes the complete canonical article with no Node crypto', async () => {
  const input: NodeSyncHashInput = {
    anchorLink: null, attachments: [], content: 'Complete 完整😀\r\nBody', createdAt: 'now',
    deletedAt: null, desiredRetention: null, enableShortTerm: null, sequentialReadingEnabled: null,
    shelvedAt: null, manualChildOrder: null, hideTitleHeading: false, id: 'article', imageRegions: null,
    importContentFingerprint: null, importSourceFingerprint: null, isTitleManual: false, kind: 'topic',
    openingText: null, parentId: null, priority: null, reveal: null, title: 'Article', updatedAt: 'now',
    virtualFilter: null
  };
  expect(computeSyncContentHash('node', input))
    .toBe(await expectedHash(JSON.stringify(buildCanonicalNodeSyncPayload(input))));
});
