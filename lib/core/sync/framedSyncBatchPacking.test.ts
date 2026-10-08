import { expect, it } from 'vitest';

import { packFramedSyncTransfers } from './framedSyncBatchPacking.js';

async function packed(sizes: number[]) {
  const result = [];
  async function* source() { yield* sizes.map((size, id) => ({ size, id })); }
  for await (const batch of packFramedSyncTransfers(source(), item => item.size)) result.push(batch.map(item => item.id));
  return result;
}

it('flushes the stable prefix, exclusive large items, and the final partial batch', async () => {
  expect(await packed([400_000, 400_000, 400_000, 1_200_000, 2_500_000, 100_000, 100_000]))
    .toEqual([[0, 1], [2], [3], [4], [5, 6]]);
});

it('bounds tiny item count without reordering', async () => {
  const batches = await packed(Array.from({ length: 129 }, () => 1));
  expect(batches.map(batch => batch.length)).toEqual([128, 1]);
  expect(batches.flat()).toEqual(Array.from({ length: 129 }, (_, id) => id));
});
