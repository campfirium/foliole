import { expect, it } from 'vitest';

import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';

it('runs companion sync writer tasks one at a time', async () => {
  const events: string[] = [];
  let releaseFirst = () => {};
  const firstRelease = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = runCompanionSyncWriterTask(async () => {
    events.push('first:start');
    await firstRelease;
    events.push('first:end');
    return 'first';
  });
  const second = runCompanionSyncWriterTask(async () => {
    events.push('second:start');
    events.push('second:end');
    return 'second';
  });

  await Promise.resolve();
  expect(events).toEqual(['first:start']);

  releaseFirst();
  await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
  expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
});

it('continues after a failed companion sync writer task', async () => {
  await expect(runCompanionSyncWriterTask(async () => {
    throw new Error('boom');
  })).rejects.toThrow('boom');

  await expect(runCompanionSyncWriterTask(async () => 'next')).resolves.toBe('next');
});
