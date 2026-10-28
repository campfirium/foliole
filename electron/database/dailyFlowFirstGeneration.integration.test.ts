// @vitest-environment node
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { changeCycleHash } from '../../lib/core/flow/cycleFlowFingerprint.js';
import { EMPTY_CYCLE_HASH } from '../../lib/core/flow/cycleFlowTypes.js';
import { loadDailyFlowLearningSnapshot } from '../../lib/core/flow/dailyFlowLearningSnapshot.js';
import { prepareFlowSession } from '../../lib/core/flow/dailyFlowPlanning.js';
import { openDailyFlow, type DailyFlowPersistence } from '../../lib/core/flow/dailyFlowService.js';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeLibraries, createPeer, startLibraries, type Peer } from './syncLibrary.testSupport.js';

const now = '2026-10-26T08:00:00.000Z';
const unsupported = async (): Promise<never> => { throw new Error('Learning writes are outside the generation fixture.'); };
const persistence: DailyFlowPersistence = {
  learningSnapshot: (db, ids) => loadDailyFlowLearningSnapshot(db, 'desktop', ids),
  snapshot: unsupported, grade: unsupported, reading: unsupported, reviewHistory: unsupported
};
const settings = (peer: Peer) => ({ scope: hashTextBody(peer.file), newDayStartsAtHour: 4,
  pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue });

afterEach(closeLibraries);

function addTopics(peer: Peer, start: number, end: number) {
  const insert = peer.db.prepare(`INSERT INTO nodes
    (id, kind, title, content, created_at, updated_at, is_title_manual)
    VALUES (?, 'topic', ?, ?, '2026-01-01T00:00:00.000Z', ?, 1)`);
  peer.db.transaction(() => {
    for (let index = start; index < end; index++) {
      const id = `node-${String(index).padStart(8, '0')}-0123456789abcdef`;
      insert.run(id, `Title ${index}`, 'Complete body '.repeat(140), now);
    }
  })();
}

async function firstGeneration(peer: Peer) {
  peer.db.exec('DELETE FROM daily_flow_entries; DELETE FROM daily_flow_state; DELETE FROM daily_flow_operations');
  expect(await readDailyFlow(peer.port)).toBeNull();
  expect(await readCycleRows(peer.port)).toEqual([]);
  const start = performance.now();
  const result = await openDailyFlow(peer.port, { now, mode: 'recommended' }, settings(peer), persistence);
  return { result, durationMs: performance.now() - start };
}

async function sampleFirstGeneration(peer: Peer) {
  const samples = [];
  for (let index = 0; index < 3; index++) samples.push(await firstGeneration(peer));
  return { durationMs: Math.min(...samples.map(value => value.durationMs)), last: samples.at(-1)!,
    samples: samples.map(value => value.durationMs) };
}

it('persists every eligible large-library task and scales below quadratic growth on first generation', async () => {
  await startLibraries();
  const peer = createPeer('desktop');
  addTopics(peer, 0, 5000);
  // Warm the production path before comparing sizes, with no stored daily list in any sample.
  await firstGeneration(peer);
  const small = await sampleFirstGeneration(peer);
  addTopics(peer, 5000, 40000);
  const protectedBefore = peer.db.prepare('SELECT COUNT(*) AS n, SUM(LENGTH(content)) AS chars FROM nodes').get();
  const large = await sampleFirstGeneration(peer);
  const session = large.last.result.session;
  const planned = prepareFlowSession(await persistence.learningSnapshot(peer.port),
    { now, mode: 'recommended' }, settings(peer));
  const rows = await readCycleRows(peer.port);
  expect(rows.map(row => row.node_id)).toEqual(planned.queueNodeIds);
  expect(rows).toHaveLength(40000);
  expect(rows.every((row, index) => row.order_key === index + 1 && row.active === 1
    && row.cohort === 'queue' && row.initial_task === 1 && row.handled === 0)).toBe(true);
  expect(session.cycle).toMatchObject({ remaining: 40000, tailKey: 40000, clearKey: 40000,
    rowsHash: changeCycleHash(EMPTY_CYCLE_HASH, [], rows) });
  expect(session.currentNodeId).toBe(planned.currentNodeId);
  const reader = new Database(peer.file, { readonly: true });
  try {
    const port = createBetterSqliteDbPort(reader);
    expect((await readDailyFlow(port))?.session).toEqual(session);
    expect(await readCycleRows(port)).toEqual(rows);
  } finally { reader.close(); }
  const reopened = await openDailyFlow(peer.port, { now, mode: 'recommended' }, settings(peer), persistence);
  expect(reopened.session).toEqual(session);
  expect(await readCycleRows(peer.port)).toEqual(rows);
  expect(peer.db.prepare('SELECT COUNT(*) AS n, SUM(LENGTH(content)) AS chars FROM nodes').get()).toEqual(protectedBefore);
  fs.mkdirSync('.tmp/artifacts/T441/first-generation', { recursive: true });
  fs.writeFileSync('.tmp/artifacts/T441/first-generation/scaling.json', JSON.stringify({
    small: small.samples, large: large.samples, growth: large.durationMs / small.durationMs }));
  // Eight times the data may grow at most sixteenfold: ample noise margin over linear work,
  // while rejecting the old repeated whole-queue scans without a machine-specific ms target.
  expect(large.durationMs / small.durationMs).toBeLessThan(16);
}, 30000);
