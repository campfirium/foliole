// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import type { CycleRow } from '../../lib/core/flow/cycleFlowTypes.js';
import type { DailyFlowCommitArgs, DailyFlowResult } from '../../lib/core/flow/dailyFlowContract.js';
import { recordDailyFlowSync } from '../../lib/core/flow/dailyFlowSyncRecord.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';

import { closeLibraries, createPeer, startLibraries, type Peer } from './syncLibrary.testSupport.js';

const now = '2026-10-29T08:00:00.000Z';
const id = '00000000-0000-4000-8000-000000000599';
const settings = { newDayStartsAtHour: 4, pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue,
  dayWindow: { start: '2026-10-29T04:00:00.000Z', end: '2026-10-30T04:00:00.000Z' } };
const delta = { readingElapsedMs: 0, reviewElapsedMs: 0, readTopicCount: 0, reviewedItemCount: 0 };

function result(count: number): DailyFlowResult {
  return { mode: 'recommended', session: {
    flowFormat: 'cycle-v1', cycle: { clearKey: count, clearedAt: null, scanAfter: count ? 1 : 0,
      lapLimit: count, tailKey: count, remaining: count, reviewRemaining: 0 },
    currentNodeId: count ? '资料-😀-"quoted"-\\-\n' : null,
    isAnswerRevealed: false, queueNodeIds: count ? ['资料-😀-"quoted"-\\-\n'] : [], totalNodeCount: count,
    completedAt: null,
    daily: { scope: 'local-only', dayKey: settings.dayWindow.start, revision: 1 }
  } };
}

function expectedSession(value: DailyFlowResult) {
  const session = value.session;
  return { flowFormat: 'cycle-v1', cycle: session.cycle, currentNodeId: session.currentNodeId,
    isAnswerRevealed: false, queueNodeIds: session.queueNodeIds, totalNodeCount: session.totalNodeCount,
    completedAt: null };
}

function readFact(peer: Peer, objectId = id) {
  const reader = new Database(peer.file, { readonly: true });
  try {
    return reader.prepare(`SELECT f.payload_json, s.content_hash FROM daily_flow_sync_facts f
      JOIN sync_object_state s ON s.object_type='daily_flow' AND s.object_id=f.id WHERE f.id=?`)
      .get(objectId) as { payload_json: string; content_hash: string };
  } finally { reader.close(); }
}

function expectCompatible(peer: Peer, objectId: string, expected: object) {
  const text = JSON.stringify(expected);
  expect(readFact(peer, objectId)).toEqual({ payload_json: text,
    content_hash: computeSyncContentHash('daily_flow', JSON.parse(text)) });
}

afterEach(() => { vi.restoreAllMocks(); closeLibraries(); });

it.each([0, 14241])('serializes a %s-row fact once and persists the exact historical JSON and hash', async count => {
  await startLibraries();
  const peer = createPeer('desktop');
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(id);
  const value = result(count);
  const rows: CycleRow[] = Array.from({ length: count }, (_, index) => ({
    node_id: index ? `node-${index}` : value.session.currentNodeId!, order_key: index + 1,
    active: 1, cohort: 'queue', handled: 0, initial_task: 1
  }));
  const stringify = vi.spyOn(JSON, 'stringify');
  await peer.port.transaction(tx => recordDailyFlowSync(tx, value, settings, now, undefined, rows));
  const completeTraversals = stringify.mock.calls.filter(([input]) => input && typeof input === 'object'
    && 'rootId' in input && 'rows' in input).length;
  stringify.mockRestore();
  const expected = { id, rootId: id, parentId: null, occurredAt: now, kind: 'create', targetOpId: null,
    nodeId: null, action: 'navigate', statsDelta: delta, mode: 'recommended', settings,
    session: expectedSession(value), rows, removedNodeIds: [] };
  expectCompatible(peer, id, expected);
  expect(completeTraversals).toBe(1);
  const stored = readFact(peer);
  await peer.port.transaction(tx => recordDailyFlowSync(tx, value, settings, now));
  await peer.port.transaction(tx => recordDailyFlowSync(tx, { ...value, replayed: true }, settings, now));
  expect(readFact(peer)).toEqual(stored);
  expect(peer.db.prepare('SELECT COUNT(*) AS n FROM daily_flow_sync_facts').get()).toEqual({ n: 1 });
});

it('preserves advance, undo and redo JSON and hashes without changing the parent chain', async () => {
  await startLibraries();
  const peer = createPeer('desktop');
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(id);
  const value = result(1);
  await peer.port.transaction(tx => recordDailyFlowSync(tx, value, settings, now, undefined, []));
  let parentId = id;
  for (const [index, kind] of (['advance', 'undo', 'redo'] as const).entries()) {
    const stamp = new Date(Date.parse(now) + index + 1).toISOString();
    const command: DailyFlowCommitArgs = { opId: kind, now: stamp, token: value.session.daily!,
      ...(kind === 'advance' ? {} : { historyMode: kind, historyTargetOpId: 'advance' }) };
    await peer.port.transaction(tx => recordDailyFlowSync(tx, value, settings, stamp, command));
    expectCompatible(peer, kind, { id: kind, rootId: id, parentId, occurredAt: stamp, kind,
      targetOpId: kind === 'advance' ? null : 'advance', nodeId: null,
      action: kind === 'advance' ? 'navigate' : 'history', statsDelta: delta, mode: 'recommended',
      settings, session: expectedSession(value), rows: [], removedNodeIds: [] });
    parentId = kind;
  }
  expect(peer.db.prepare('SELECT head_id FROM daily_flow_sync_projection').get()).toEqual({ head_id: 'redo' });
});
