import type { DatabaseDriver } from '../../lib/core/database/driver.js';

import { openDatabaseConnection } from './connection.js';

// Local-only workspace_meta row: a new library is born with the sample pending, the startup
// seed turns it into the seeded root, and the first renderer startup consumes that root once.
const GUIDED_SAMPLE_SEED_KEY = 'guided_sample_seed';
const PENDING_VALUE = 'pending';
const SEEDED_PREFIX = 'seeded:';

export type GuidedSampleSeedState = { kind: 'pending' } | { kind: 'seeded'; rootNodeId: string };

function writeSeedValue(driver: DatabaseDriver, value: string, timestamp: string) {
  driver.execute(
    `INSERT INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [GUIDED_SAMPLE_SEED_KEY, value, timestamp]
  );
}

export function markGuidedSampleSeedPending(driver: DatabaseDriver, timestamp: string) {
  writeSeedValue(driver, PENDING_VALUE, timestamp);
}

export function markGuidedSampleSeeded(driver: DatabaseDriver, rootNodeId: string, timestamp: string) {
  writeSeedValue(driver, `${SEEDED_PREFIX}${rootNodeId}`, timestamp);
}

export function clearGuidedSampleSeedState(driver: DatabaseDriver) {
  driver.execute('DELETE FROM workspace_meta WHERE key = ?', [GUIDED_SAMPLE_SEED_KEY]);
}

export function readGuidedSampleSeedState(driver: DatabaseDriver): GuidedSampleSeedState | null {
  const value = driver.queryOne<{ value: string }>(
    'SELECT value FROM workspace_meta WHERE key = ?',
    [GUIDED_SAMPLE_SEED_KEY]
  )?.value;
  if (value === PENDING_VALUE) return { kind: 'pending' };
  if (value?.startsWith(SEEDED_PREFIX)) return { kind: 'seeded', rootNodeId: value.slice(SEEDED_PREFIX.length) };
  return null;
}

/** Hands the freshly seeded sample root to the first startup that asks, then forgets it. */
export function consumeGuidedSampleStartup(): string | null {
  const driver = openDatabaseConnection().driver;
  return driver.transaction((transaction) => {
    const state = readGuidedSampleSeedState(transaction);
    if (state?.kind !== 'seeded') return null;
    clearGuidedSampleSeedState(transaction);
    return state.rootNodeId;
  });
}
