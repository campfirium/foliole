import { expect, it } from 'vitest';

import { compareFramedSyncDatabaseInventories } from './framedSyncDatabaseDifference.js';
import { pendingFramedSyncOverwriteDifferences } from './framedSyncOverwriteCompletion.js';

const source = { globalId: 'article', objectType: 'node', frontierFactIds: ['v1'],
  requiredRelationIds: ['edge'], reviewFactIds: ['review'], stateFactIds: ['state'],
  sharedStateHash: new Uint8Array(32).fill(1), resourceHashes: [] };
const local = { ...source, frontierFactIds: ['v1', 'v2'], sharedStateHash: new Uint8Array(32).fill(2) };
const deliveredDifferences = compareFramedSyncDatabaseInventories({ local: [], remote: [source] });
const args = { local: [local], remote: [source], deliveredDifferences };

it('finishes verified source reception while retaining a different local head for ordinary duplex sync', () => {
  expect(pendingFramedSyncOverwriteDifferences(args)).toEqual([]);
  expect(compareFramedSyncDatabaseInventories(args)).toMatchObject([
    { direction: 'local_to_remote', need: { frontierFactIds: ['v2'], sharedState: true } },
    { direction: 'remote_to_local', need: { frontierFactIds: [], sharedState: true } }
  ]);
});

it('keeps an unacknowledged source snapshot pending', () => {
  expect(pendingFramedSyncOverwriteDifferences({ ...args, deliveredDifferences: [] })).toHaveLength(1);
});

it.each(['sharedStateHash', 'frontierFactIds', 'requiredRelationIds', 'reviewFactIds', 'stateFactIds'] as const)(
  'keeps reception pending if source %s changed after delivery', key => {
    const changed = key === 'sharedStateHash' ? new Uint8Array(32).fill(3) : ['changed'];
    expect(pendingFramedSyncOverwriteDifferences({ ...args, remote: [{ ...source, [key]: changed }] })).toHaveLength(1);
  });

it.each(['frontierFactIds', 'requiredRelationIds', 'reviewFactIds', 'stateFactIds'] as const)(
  'keeps a missing original %s pending despite a successful delivery', key => {
    expect(pendingFramedSyncOverwriteDifferences({ ...args, local: [{ ...local, [key]: [] }] })).toHaveLength(1);
  });

it('does not use a node receipt to complete another object type with the same ID', () => {
  expect(pendingFramedSyncOverwriteDifferences({ ...args,
    local: [{ ...local, objectType: 'external_document' }], remote: [{ ...source, objectType: 'external_document' }] }))
    .toHaveLength(1);
});
