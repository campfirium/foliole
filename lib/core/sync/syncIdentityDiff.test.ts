import { expect, it } from 'vitest';

import {
  diffSyncIdentitySummaries, emptySyncIdentitySummary, type SyncIdentityPageReader
} from './syncIdentityDiff.js';
import {
  syncIdentityPartition, syncIdentityPartitionDigest, type SyncIdentityEntry
} from './syncIdentityDigest.js';

function fixture() {
  const partition = syncIdentityPartition('node', 'a');
  const ids = ['a'];
  for (let index = 0; ids.length < 3; index += 1) {
    const id = `candidate-${index}`;
    if (syncIdentityPartition('node', id) === partition) ids.push(id);
  }
  ids.sort();
  const source = [
    { object_type: 'node', object_id: ids[0]!, fingerprint: 'first' },
    { object_type: 'node', object_id: ids[1]!, fingerprint: 'source' }
  ];
  const receiver = [
    { object_type: 'node', object_id: ids[1]!, fingerprint: 'receiver' },
    { object_type: 'node', object_id: ids[2]!, fingerprint: 'last' }
  ];
  const summary = (rows: SyncIdentityEntry[]) => {
    const result = emptySyncIdentitySummary();
    result[partition] = { partition, digest: syncIdentityPartitionDigest(rows), row_count: rows.length };
    return result;
  };
  const reader = (rows: SyncIdentityEntry[]): SyncIdentityPageReader => async (_, after) => {
    const remaining = rows.filter((row) => !after || row.object_id > after.object_id);
    const entries = remaining.slice(0, 1);
    return { entries, nextAfter: remaining.length > 1 ? {
      object_type: entries[0]!.object_type, object_id: entries[0]!.object_id
    } : null };
  };
  return { partition, source, receiver, summary, reader };
}

it('finds older missing IDs and divergent heads through bounded bidirectional pages', async () => {
  const { source, receiver, summary, reader } = fixture();
  const differences = [];
  for await (const difference of diffSyncIdentitySummaries(
    summary(source), summary(receiver), reader(source), reader(receiver)
  )) differences.push(difference);
  expect(differences.map((difference) => difference.kind))
    .toEqual(['source_only', 'divergent', 'receiver_only']);
  expect(differences[0]).toMatchObject({ source: source[0] });
  expect(differences[1]).toMatchObject({ source: source[1], receiver: receiver[0] });
  expect(differences[2]).toMatchObject({ receiver: receiver[1] });
});

it('rejects an incomplete page stream after scanning its advertised partition', async () => {
  const { source, receiver, summary, reader } = fixture();
  const collect = async () => {
    for await (const difference of diffSyncIdentitySummaries(
      summary(source), summary(receiver), reader(source.slice(0, 1)), reader(receiver)
    )) { void difference; }
  };
  await expect(collect()).rejects.toThrow('sync_identity_partition_digest_mismatch');
});
