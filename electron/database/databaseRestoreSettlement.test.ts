// @vitest-environment node

import { expect, it, vi } from 'vitest';

import {
  beginApplicationDatabaseRestore,
  waitForApplicationDatabaseRestoreSettlement
} from './databaseRestoreSettlement.js';

it('keeps quit preparation waiting until the active restore settles', async () => {
  const finishRestore = beginApplicationDatabaseRestore();
  const settled = vi.fn();
  const waiting = waitForApplicationDatabaseRestoreSettlement().then(settled);

  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
  expect(beginApplicationDatabaseRestore).toThrow('Another backup restore is already in progress.');

  finishRestore();
  await waiting;
  expect(settled).toHaveBeenCalledOnce();
  await expect(waitForApplicationDatabaseRestoreSettlement()).resolves.toBeUndefined();
});
