// @vitest-environment node
import { createRequire } from 'node:module';

import { expect, it } from 'vitest';

import { SqliteConnectionCoordinator } from './sqliteConnectionCoordinator.js';

const require = createRequire(import.meta.url);
const { install } = require('../../scripts/windows/sync-sqlite-wait-diagnostics.cjs');

it('records the active owner and queued maintenance without changing their order', async () => {
  const records: unknown[] = [];
  const stop = install((record: unknown) => records.push(record));
  const coordinator = new SqliteConnectionCoordinator({ name: ':memory:', readonly: true });
  let release!: () => void;
  try {
    const active = coordinator.runExclusive(() => new Promise<void>(resolve => { release = resolve; }));
    const queued = coordinator.runMaintenance(() => undefined);
    expect(records).toContainEqual(expect.objectContaining({ event: 'coordinator_state', transition: 'queued',
      database: { name: ':memory:', readonly: true }, active: expect.objectContaining({ canClose: false }),
      waiting: [expect.objectContaining({ canClose: true, stack: expect.any(String) })] }));
    release();
    await Promise.all([active, queued]);
    expect(records.at(-1)).toMatchObject({ active: null, waiting: [] });
  } finally { stop(); }
});
