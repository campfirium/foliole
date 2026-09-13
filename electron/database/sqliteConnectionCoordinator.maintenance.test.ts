// @vitest-environment node

import { createRequire } from 'node:module';

import { expect, it } from 'vitest';

import { guardBetterSqliteDatabase } from './guardedBetterSqliteDatabase.js';
import { SqliteConnectionCoordinator } from './sqliteConnectionCoordinator.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

it('waits for active work and keeps later work behind maintenance', async () => {
  const coordinator = new SqliteConnectionCoordinator();
  const order: string[] = [];
  let finishActive!: () => void;
  const active = coordinator.runExclusive(async () => {
    order.push('active-start');
    await new Promise<void>((resolve) => { finishActive = resolve; });
    order.push('active-end');
  });
  const maintenance = coordinator.runMaintenance(() => { order.push('maintenance'); });
  const later = coordinator.runExclusive(() => { order.push('later'); });

  await Promise.resolve();
  expect(order).toEqual(['active-start']);
  finishActive();
  await Promise.all([active, maintenance, later]);

  expect(order).toEqual(['active-start', 'active-end', 'maintenance', 'later']);
});

it('allows only a maintenance owner to close the guarded connection', async () => {
  const coordinator = new SqliteConnectionCoordinator();
  const sqlite = guardBetterSqliteDatabase(new BetterSqlite3(':memory:'), coordinator);

  await expect(coordinator.runExclusive(() => sqlite.close()))
    .rejects.toThrow('cannot close sqlite connection while coordinated work is active');
  await expect(coordinator.runMaintenance(() => sqlite.close())).resolves.toBe(sqlite);
});

it('does not allow ordinary work to promote itself into maintenance', async () => {
  const coordinator = new SqliteConnectionCoordinator();

  await expect(coordinator.runExclusive(() => coordinator.runMaintenance(() => undefined)))
    .rejects.toThrow('sqlite connection owner cannot enter maintenance');
});
