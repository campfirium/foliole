// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import {
  beginDatabaseStartup,
  markDatabaseReady,
  markDatabaseStartupFailed,
  resetDatabaseReadinessForTests,
  waitForDatabaseReady
} from './databaseReadiness.js';

afterEach(() => {
  resetDatabaseReadinessForTests();
});

it('waits while database startup is pending and resolves when ready', async () => {
  beginDatabaseStartup();
  const ready = vi.fn();
  const waiting = waitForDatabaseReady().then(ready);

  await Promise.resolve();
  expect(ready).not.toHaveBeenCalled();

  markDatabaseReady();
  await waiting;
  expect(ready).toHaveBeenCalledTimes(1);
});

it('rejects pending and future waiters after database startup failure', async () => {
  beginDatabaseStartup();
  const waiting = waitForDatabaseReady();
  const error = new Error('migration exploded');

  markDatabaseStartupFailed(error);

  await expect(waiting).rejects.toThrow('migration exploded');
  await expect(waitForDatabaseReady()).rejects.toThrow('migration exploded');
});

it('resets to ready for isolated tests', async () => {
  beginDatabaseStartup();
  markDatabaseStartupFailed(new Error('migration exploded'));

  resetDatabaseReadinessForTests();

  await expect(waitForDatabaseReady()).resolves.toBeUndefined();
});
