// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';

import { closeLibraries, createPeer, edit, joinPeers, startLibraries } from './syncLibrary.testSupport.js';
import { syncRequestLibrary } from './syncRequestLibrary.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('persists every shared reading field through repeated current requests', async () => {
  const source = createPeer('reading-source'); const target = createPeer('reading-target');
  joinPeers(source, target);
  edit(source, 'same body');
  await syncRequestLibrary(source, target);
  saveNodeReadingStateWithSync(source.driver, { nodeId: 'topic', hostName: source.name,
    reading: { intervalDurationMs: 123456, intervalGrowthFactor: 2.75,
      lastHandledAt: '2026-10-06T00:00:00.000Z', nextAt: '2026-10-09T00:00:00.000Z',
      priority: 3, readingPosition: 0, repetitionCount: 7, state: 'active' },
    updatedAt: '2026-10-06T00:00:00.000Z' });
  await syncRequestLibrary(source, target);
  await syncRequestLibrary(source, target);
  const query = `SELECT node_id, interval_duration_ms, interval_growth_factor, last_handled_at,
    next_at, priority, repetition_count, state FROM node_reading`;
  expect(target.db.prepare(query).all()).toEqual(source.db.prepare(query).all());
});
