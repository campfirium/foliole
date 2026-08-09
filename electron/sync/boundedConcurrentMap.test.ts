import { expect, it } from 'vitest';

import { boundedConcurrentMap } from './boundedConcurrentMap.js';

it('preserves order while keeping resource work within the concurrency bound', async () => {
  let active = 0;
  let maximumActive = 0;
  const releases: Array<() => void> = [];
  const result = boundedConcurrentMap([1, 2, 3, 4, 5], 3, async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise<void>((resolve) => { releases.push(resolve); });
    active -= 1;
    return value * 2;
  });

  await viWaitFor(() => releases.length === 3);
  releases.splice(0).forEach((release) => release());
  await viWaitFor(() => releases.length === 2);
  releases.splice(0).forEach((release) => release());

  await expect(result).resolves.toEqual([2, 4, 6, 8, 10]);
  expect(maximumActive).toBe(3);
});

async function viWaitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error('condition_not_reached');
}
