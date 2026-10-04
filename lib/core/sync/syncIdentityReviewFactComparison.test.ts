import { expect, it } from 'vitest';

import type { SyncIdentityNodeFactSection } from './syncIdentityNodeFactPage.js';
import { loadSyncIdentityNodeFactDescription } from './syncIdentityNodeFactReadAll.js';
import { compareSyncIdentityReviewFacts } from './syncIdentityReviewFactComparison.js';

function review(index: number) {
  const id = `op-${String(index).padStart(6, '0')}`;
  return { id, op_id: id, host_name: 'origin', node_id: 'node', grade: 3,
    scheduler_version: 'fsrs', reviewed_at: 'now', due_before: 'before',
    stability_before: 1, difficulty_before: 1, due_after: 'after', stability_after: 2,
    difficulty_after: 2 };
}

function reader(count: number, missing = -1, collision = -1) {
  let reads = 0;
  const read = async (section: SyncIdentityNodeFactSection, after: string | null) => {
    reads++;
    const start = after === null ? 0 : Number(after.slice(3)) + 1;
    const indices: number[] = [];
    let next = start;
    while (next < count && indices.length < 128) {
      if (next !== missing) indices.push(next);
      next++;
    }
    const entries = section === 'reviews' ? indices.map((index) =>
      ({ ...review(index), grade: index === collision ? 1 : 3 })) : [];
    return { node_id: 'node', head_id: 'head', section, fact_digest: 'a'.repeat(64),
      requirements_digest: 'b'.repeat(64), entries,
      nextAfter: section === 'reviews' && next < count ? entries.at(-1)!.op_id : null };
  };
  return { read, reads: () => reads };
}

it('compares ten thousand valid review facts through pages without a node total limit', async () => {
  const left = reader(10000);
  const right = reader(10000, 4096);
  expect(await compareSyncIdentityReviewFacts('node', 'head', left.read, right.read))
    .toEqual({ leftNeedsRepair: false, rightNeedsRepair: true });
  expect(left.reads()).toBe(Math.ceil(10000 / 128));
  expect(right.reads()).toBe(Math.ceil(9999 / 128));
});

it('accepts a fact description above the former 4096 boundary', async () => {
  const source = reader(4097);
  const description = await loadSyncIdentityNodeFactDescription('node', source.read);
  expect(description.reviews).toHaveLength(4097);
  const streamed = await loadSyncIdentityNodeFactDescription('node', source.read,
    { includeReviews: false });
  expect(streamed.reviews).toEqual([]);
});

it('detects immutable review collisions after the former total boundary', async () => {
  await expect(compareSyncIdentityReviewFacts('node', 'head', reader(5000).read,
    reader(5000, -1, 4500).read)).rejects.toThrow('sync_review_log_op_mismatch:op-004500');
});
