import Database from 'better-sqlite3';
import { expect } from 'vitest';

import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver';
import { createPeer, joinPeers, startLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { syncRequestLibrary } from '../../electron/database/syncRequestLibrary.testSupport';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations';
import { hashTextBody } from '../../lib/core/database/textBodyHash';
import type { DailyFlowSettings } from '../../lib/core/flow/dailyFlowContract';
import { commitDailyFlow, openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession';
import { readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings';
import { readCompanionReviewTopic } from '../companion/companionReadingReview';
import { gradeCompanionReviewCard } from '../companion/companionReviewSession';
import { companionDailyFlowPersistence } from '../shared/platform/companion/runtime/companionDailyFlow';

export const now = '2026-10-26T08:00:00.000Z';
export const due = '2026-10-26T08:01:00.000Z';
export const persistence = companionDailyFlowPersistence;
export const snapshot = async (peer: Peer) => ({ activeNodeId: null, untitledSequenceByParent: {},
  ...await persistence.snapshot(peer.port) });
export const settings = (peer: Peer): DailyFlowSettings => ({ scope: hashTextBody(peer.file),
  newDayStartsAtHour: 4, pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue });

export async function setupPeers() {
  await startLibraries();
  const peers = [createPeer('desktop'), createPeer('mobile')] as const;
  joinPeers(...peers);
  for (const peer of peers) {
    peer.db.exec('CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
    peer.db.prepare("INSERT INTO companion_meta VALUES ('host_name', ?, ?)").run(peer.name, now);
  }
  return peers;
}

export function node(peer: Peer, id: string, kind: 'item' | 'topic' | 'folder', parentNodeId: string | null = null) {
  upsertNodeSnapshot(peer.driver, { nodeId: id, kind, parentNodeId, title: id, content: `Body ${id}`,
    reveal: kind === 'item' ? 'Answer' : null, anchorLink: null, isTitleManual: true,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: now, position: null, hostName: peer.name });
  flushNodeSyncVersionWithDriver(peer.driver, id, peer.name, now);
}

export function publish(peer: Peer, id: string, stamp = due) {
  peer.db.prepare('UPDATE nodes SET sync_dirty=1, last_modified_by_host_name=?, updated_at=? WHERE id=?')
    .run(peer.name, stamp, id);
  flushNodeSyncVersionWithDriver(peer.driver, id, peer.name, stamp);
}

export async function exchange(a: Peer, b: Peer) {
  await syncRequestLibrary(a, b);
  await syncRequestLibrary(b, a);
}

export async function open(peer: Peer, stamp = now, config = settings(peer), mode: 'recommended' | 'reading-only' = 'recommended') {
  return (await openDailyFlow(peer.port, { now: stamp, mode }, config, persistence)).session;
}

export async function act(peer: Peer, session: DailyFlowSession, action: 'grade' | 'read' | 'soon', stamp = now,
  config = settings(peer)) {
  const before = await snapshot(peer);
  const id = session.currentNodeId!;
  const base = { opId: crypto.randomUUID(), now: stamp, token: session.daily!, sourceSession: session };
  if (action === 'grade') {
    const result = await gradeCompanionReviewCard({ snapshot: before, nodeId: id, grade: 3, now: stamp });
    if (!result) throw new Error('test_grade_missing');
    const { cardBefore, cardAfter, schedulerVersion } = result.reviewLog;
    return (await commitDailyFlow(peer.port, { ...base, grade: { nodeId: id, before: before.nodesById[id]!.review,
      grade: 3, reviewedAt: stamp, cardBefore, cardAfter, schedulerVersion } }, config, persistence)).session;
  }
  const reading = action === 'read' ? readCompanionReviewTopic({ snapshot: before, nodeId: id, now: stamp })!.snapshot.nodesById[id]!.reading : before.nodesById[id]!.reading;
  return (await commitDailyFlow(peer.port, { ...base, readingAction: action === 'soon' ? 'soon' : 'read',
    readings: [{ nodeId: id, before: before.nodesById[id]!.reading, after: reading }] }, config, persistence)).session;
}

export async function assertDurable(peer: Peer, session: DailyFlowSession) {
  expect((await readDailyFlow(peer.port))!.session).toEqual(session);
  const reader = new Database(peer.file, { readonly: true });
  try {
    const rows = reader.prepare('SELECT node_id FROM daily_flow_entries WHERE queue_position IS NOT NULL ORDER BY queue_position').all();
    expect(rows).toEqual(session.queueNodeIds.map(node_id => ({ node_id })));
    expect(reader.prepare('SELECT invalidated FROM daily_flow_state').get()).toEqual({ invalidated: 0 });
  } finally { reader.close(); }
}
